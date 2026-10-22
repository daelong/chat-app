'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { loginSchema, signUpSchema } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { login, signUp } from '../api/auth';
import { memberSessionKey } from '../hooks/use-member-session';
import { GoogleLogin } from './google-login';

export function AuthForm({ mode, loginNotice }: { mode: 'login' | 'sign-up'; loginNotice?: string }) {
  const isSignUp = mode === 'sign-up';
  const [validation, setValidation] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async (fields: { email: string; password: string; displayName: string }) =>
      isSignUp ? signUp(signUpSchema.parse(fields)) : login(loginSchema.parse({ email: fields.email, password: fields.password })),
    onSuccess: async (session) => {
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(memberSessionKey, session);
      router.replace('/chats');
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const form = new FormData(event.currentTarget);
    const fields = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? ''),
      displayName: String(form.get('displayName') ?? '') };
    const parsed = isSignUp ? signUpSchema.safeParse(fields) : loginSchema.safeParse({ email: fields.email, password: fields.password });
    if (!parsed.success) { setValidation(isSignUp ? '이메일과 이름, 비밀번호(8~15자)를 확인해 주세요.' : '이메일과 비밀번호를 확인해 주세요.'); return; }
    setValidation('');
    mutation.mutate(fields);
  }
  const inputClass = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <Link href="/chats" className="mb-10 text-xl font-bold text-indigo-700">Chat App</Link>
    <h1 className="text-3xl font-bold">{isSignUp ? '회원가입' : '로그인'}</h1>
    <p className="mt-3 leading-7 text-slate-500">{isSignUp ? '계정을 만들고 새로운 대화를 시작하세요.' : '내 채팅방으로 돌아오세요.'}</p>
    {loginNotice && <p role="alert" className="mt-4 text-sm text-red-700">{loginNotice}</p>}
    <form onSubmit={submit} className="mt-8 space-y-5">
      {isSignUp && <div><label htmlFor="displayName" className="text-sm font-medium">이름</label>
        <input id="displayName" name="displayName" autoComplete="nickname" required maxLength={50} className={inputClass} disabled={mutation.isPending} /></div>}
      <div><label htmlFor="email" className="text-sm font-medium">이메일</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClass} disabled={mutation.isPending} /></div>
      <div><label htmlFor="password" className="text-sm font-medium">비밀번호</label>
        <input id="password" name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'}
          required minLength={isSignUp ? 8 : 1} maxLength={isSignUp ? 15 : 128} aria-describedby={isSignUp ? 'password-help' : undefined}
          className={inputClass} disabled={mutation.isPending} />
        {isSignUp && <p id="password-help" className="mt-2 text-xs text-slate-500">8~15자로 입력해 주세요.</p>}</div>
      {(validation || mutation.isError) && <p role="alert" className="text-sm text-red-700">{validation || errorMessage(mutation.error)}</p>}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? '처리 중…' : isSignUp ? '가입하고 시작하기' : '로그인'}
      </Button>
    </form>
    <GoogleLogin disabled={mutation.isPending} />
    <p className="mt-6 text-center text-sm text-slate-500">{isSignUp ? '이미 계정이 있나요? ' : '계정이 없나요? '}
      <Link href={isSignUp ? '/login' : '/sign-up'} className="font-medium text-indigo-700 underline">{isSignUp ? '로그인' : '회원가입'}</Link>
    </p>
  </main>;
}
