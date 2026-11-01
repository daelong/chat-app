'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useMemberSession } from '@/features/auth/hooks/use-member-session';
import { getRoom } from '../api/rooms';
import { InvitationManager } from '@/features/invitations/components/invitation-manager';
import { Conversation } from '@/features/messages/components/conversation';

export function RoomDetail({ roomId }: { roomId: string }) {
  const { data: session } = useMemberSession();
  const room = useQuery({
    queryKey: ['room', session?.user.id, roomId], queryFn: ({ signal }) => getRoom(roomId, signal),
    enabled: !!session, retry: false, refetchInterval: 15_000,
  });
  if (room.isPending) return <p role="status" className="text-slate-500">채팅방을 불러오고 있어요.</p>;
  if (!room.data || (room.isError && room.error instanceof ApiError && [401, 403, 404].includes(room.error.status))) return <div>
    <h1 className="text-2xl font-bold">채팅방을 열 수 없어요</h1>
    <p role="alert" className="mt-4 text-slate-500">{errorMessage(room.error)}</p>
    {!(room.error instanceof ApiError && [400, 404].includes(room.error.status)) &&
      <Button className="mt-4" onClick={() => { void room.refetch(); }}>다시 불러오기</Button>}
    <Link href="/chats" className="mt-6 block text-indigo-700 underline">내 채팅방으로 돌아가기</Link>
  </div>;
  return <section>
    <p className="text-sm font-medium text-indigo-700">{room.data.myRole === 'OWNER' ? '내가 만든 방' : '참여 중인 방'} · {room.data.memberCount}명</p>
    <h1 className="mt-3 break-words text-3xl font-bold">{room.data.name ?? '채팅방'}</h1>
    {session && <Conversation key={roomId + session.user.id} roomId={roomId} kind="MEMBER" csrfToken={session.csrfToken} />}
    {room.data.myRole === 'OWNER' && session && <InvitationManager roomId={roomId} csrfToken={session.csrfToken} />}
  </section>;
}
