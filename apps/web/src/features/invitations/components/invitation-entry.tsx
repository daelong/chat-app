'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptInvitationSchema, invitationTokenSchema } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { acceptInvitation, previewInvitation } from '../api/invitations';

const unavailable = { ACCEPTED: '이미 사용한 초대입니다. 다른 브라우저에서 입장하려면 새 초대를 요청해 주세요.',
  EXPIRED: '초대가 만료되었습니다. 초대한 사람에게 재전송을 요청해 주세요.', REVOKED: '취소된 초대입니다. 초대한 사람에게 새 초대를 요청해 주세요.' };

export function InvitationEntry() {
  const [token, setToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [validation, setValidation] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const read = () => setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
    read(); window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const valid = invitationTokenSchema.safeParse(token).success;
  // 초대 내용은 메모리에서만 조회하며 링크 열기만으로 수락하지 않습니다.
  const preview = useQuery({ queryKey: ['invitation-preview', token], queryFn: () => previewInvitation(token!), enabled: valid, retry: false, gcTime: 0 });
  const mutation = useMutation({ mutationFn: () => acceptInvitation({ token: token!, displayName: preview.data?.canResume ? '참여자' : displayName }),
    onSuccess: (session) => {
      queryClient.setQueryData(['guest-room', session.room.id], session);
      router.replace('/guest/rooms/' + session.room.id);
    }, onError: () => { void preview.refetch(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview.data?.canResume && !acceptInvitationSchema.safeParse({ token, displayName }).success) {
      setValidation('이 방에서 사용할 이름을 1~50자로 입력해 주세요.'); return;
    }
    setValidation(''); mutation.mutate();
  }
  const content = preview.data;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <p className="text-sm font-semibold text-indigo-700">Chat App · 채팅방 초대</p>
    {token === null || (valid && preview.isPending) ? <p role="status" className="mt-6 text-slate-500">초대를 확인하고 있어요.</p> : !valid ?
      <p role="alert" className="mt-6 text-red-700">초대 링크가 올바르지 않습니다. 이메일의 참여 버튼을 다시 눌러 주세요.</p> : preview.isError ?
      <div><p role="alert" className="mt-6 text-red-700">{errorMessage(preview.error)}</p><Button className="mt-4" onClick={() => { void preview.refetch(); }}>다시 확인</Button></div> : content && <>
        <h1 className="mt-4 break-words text-2xl font-bold">{content.roomName ?? '채팅방'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{content.inviterName}님이 초대했어요. 회원가입 없이 이 방에 참여할 수 있습니다.</p>
        <p className="mt-3 text-xs text-slate-500">초대 만료: {new Date(content.expiresAt).toLocaleString('ko-KR')}</p>
        {content.status !== 'PENDING' && !content.canResume ? <p role="alert" className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6">{unavailable[content.status]}</p> :
          <form onSubmit={submit} className="mt-6">
            {!content.canResume && <><label htmlFor="guest-name" className="text-sm font-medium">이 방에서 사용할 이름</label>
              <input id="guest-name" name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={50} autoComplete="nickname" disabled={mutation.isPending}
                placeholder="예: 대현" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500" />
              <p className="mt-3 text-xs leading-5 text-slate-500">참여 정보는 이 브라우저에서 7일간 유지됩니다. 초대받은 방에만 접근할 수 있으며, 다른 기기나 쿠키 삭제 후에는 새 초대가 필요합니다.</p></>}
            <Button type="submit" className="mt-5 w-full" disabled={mutation.isPending}>{mutation.isPending ? '참여 중…' : content.canResume ? '참여 중인 방으로 돌아가기' : '채팅방 참여하기'}</Button>
          </form>}
      </>}
    {(validation || mutation.isError) && <p role="alert" className="mt-4 text-sm text-red-700">{validation || errorMessage(mutation.error)}</p>}
    <Link href="/login" className="mt-8 block text-center text-sm text-slate-500 underline">회원 로그인</Link>
  </section></main>;
}
