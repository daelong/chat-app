'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { getGuestRoom } from '../api/invitations';

export function GuestRoom({ roomId }: { roomId: string }) {
  const session = useQuery({ queryKey: ['guest-room', roomId], queryFn: ({ signal }) => getGuestRoom(roomId, signal), retry: false, refetchInterval: 15_000 });
  return <main className="min-h-screen bg-slate-50 px-5 py-10"><div className="mx-auto max-w-2xl">
    <p className="text-sm font-semibold text-indigo-700">Chat App · 초대받은 방</p>
    {session.isError ? <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">방을 열 수 없어요</h1><p role="alert" className="mt-4 text-sm leading-6 text-slate-600">{errorMessage(session.error)}</p>
      {!(session.error instanceof ApiError && [400, 401, 404].includes(session.error.status)) && <Button className="mt-4" onClick={() => { void session.refetch(); }}>다시 확인</Button>}
    </section> : session.isPending ? <p role="status" className="mt-8 text-slate-500">참여 정보를 확인하고 있어요.</p> : <>
      <header className="mt-6 border-b border-slate-200 pb-6"><h1 className="break-words text-3xl font-bold">{session.data.room.name ?? '채팅방'}</h1>
        <p className="mt-3 text-sm text-slate-600">{session.data.participant.displayName}님으로 참여 중 · {session.data.room.memberCount}명</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">이 방 전용 게스트로 입장했어요. 새로고침해도 참여 정보가 유지됩니다.</p></header>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center"><p className="font-semibold">채팅방에 참여했어요.</p>
        <p className="mt-3 text-sm leading-7 text-slate-500">메시지 송수신 기능을 준비하고 있어요.</p></section>
    </>}
    <Link href="/login" className="mt-8 inline-block text-sm text-slate-500 underline">회원 로그인</Link>
  </div></main>;
}
