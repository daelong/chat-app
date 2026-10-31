'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { getGuestRoom } from '../api/invitations';
import { Conversation } from '@/features/messages/components/conversation';

export function GuestRoom({ roomId }: { roomId: string }) {
  const session = useQuery({ queryKey: ['guest-room', roomId], queryFn: ({ signal }) => getGuestRoom(roomId, signal), retry: false, refetchInterval: 15_000 });
  const blocked = session.isError && (!session.data || session.error instanceof ApiError && [400, 401, 403, 404].includes(session.error.status));
  const data = session.data;
  return <main className="min-h-screen bg-slate-50 px-5 py-10"><div className="mx-auto max-w-2xl">
    <p className="text-sm font-semibold text-indigo-700">Chat App · 초대받은 방</p>
    {blocked ? <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">방을 열 수 없어요</h1><p role="alert" className="mt-4 text-sm leading-6 text-slate-600">{errorMessage(session.error)}</p>
      {!(session.error instanceof ApiError && [400, 401, 404].includes(session.error.status)) && <Button className="mt-4" onClick={() => { void session.refetch(); }}>다시 확인</Button>}
    </section> : !data ? <p role="status" className="mt-8 text-slate-500">참여 정보를 확인하고 있어요.</p> : <>
      <header className="mt-6 border-b border-slate-200 pb-6"><h1 className="break-words text-3xl font-bold">{data.room.name ?? '채팅방'}</h1>
        <p className="mt-3 text-sm text-slate-600">{data.participant.displayName}님으로 참여 중 · {data.room.memberCount}명</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">이 방 전용 게스트로 입장했어요. 새로고침해도 참여 정보가 유지됩니다.</p></header>
      <Conversation key={roomId + data.participant.id} roomId={roomId} kind="GUEST" csrfToken={data.csrfToken} />
    </>}
    <Link href="/login" className="mt-8 inline-block text-sm text-slate-500 underline">회원 로그인</Link>
  </div></main>;
}
