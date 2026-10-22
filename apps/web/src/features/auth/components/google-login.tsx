'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api-client';
import { getAuthProviders, startGoogle } from '../api/auth';

export function GoogleLogin({ disabled }: { disabled: boolean }) {
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: getAuthProviders, retry: false });
  const login = useMutation({
    mutationFn: startGoogle,
    onSuccess: ({ authorizationUrl }) => { window.location.assign(authorizationUrl); },
  });
  if (!providers.data?.google) return null;
  return <div className="mt-6 border-t border-slate-200 pt-6">
    <button type="button" onClick={() => login.mutate()} disabled={disabled || login.isPending}
      className="flex h-10 w-full items-center rounded border border-[#747775] bg-white pr-3 text-sm font-medium text-[#1f1f1f] hover:bg-slate-50 disabled:opacity-60"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      <img src="/google-signin-icon.svg" alt="" width={40} height={40} aria-hidden="true" style={{ clipPath: 'inset(10px)' }} />
      <span className="flex-1 pr-6">{login.isPending ? 'Google로 연결 중…' : 'Google로 로그인'}</span>
    </button>
    <p className="mt-2 text-center text-xs text-slate-500">처음 이용하면 회원 계정이 만들어집니다.</p>
    {login.isError && <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(login.error)}</p>}
  </div>;
}
