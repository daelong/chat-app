'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useMemberSession } from '@/features/auth/hooks/use-member-session';
import { getRooms } from '../api/rooms';
import { createSocketClient } from '@/lib/socket-client';

export function RoomList() {
  const { data: session } = useMemberSession();
  const pathname = usePathname();
  const queries = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms', session?.user.id], queryFn: ({ signal }) => getRooms(signal), enabled: !!session, retry: false, refetchInterval: 10_000 });
  useEffect(() => {
    if (!session) return;
    const socket = createSocketClient(); socket.io.reconnectionAttempts(Infinity);
    let active = true, busy = false;
    function refresh() { void queries.invalidateQueries({ queryKey: ['rooms', session!.user.id] }); }
    async function subscribe() {
      if (busy || !active || !socket.connected) return;
      busy = true;
      try { await socket.timeout(5000).emitWithAck('rooms:subscribe', { csrfToken: session!.csrfToken }); if (active) refresh(); }
      catch { /* 목록 조회 주기로도 누락된 변경을 복구합니다. */ }
      finally { busy = false; }
    }
    socket.on('connect', () => { void subscribe(); }); socket.on('room:updated', refresh); socket.connect();
    const retry = setInterval(() => { if (document.visibilityState === 'visible') void subscribe(); }, 10_000);
    return () => { active = false; clearInterval(retry); socket.removeAllListeners(); socket.disconnect(); };
  }, [session?.user.id, session?.csrfToken, queries]);
  if (rooms.isPending) return <p role="status" className="py-6 text-sm text-slate-500">대화 목록을 불러오고 있어요.</p>;
  if (!rooms.data || rooms.isError && rooms.error instanceof ApiError && [401, 403].includes(rooms.error.status)) return <div className="py-6"><p role="alert" className="text-sm text-red-700">{errorMessage(rooms.error)}</p>
    <Button className="mt-3" onClick={() => { void rooms.refetch(); }}>다시 불러오기</Button></div>;
  if (!rooms.data.length) return <p className="py-6 text-sm leading-6 text-slate-500">아직 참여한 방이 없어요.<br />첫 채팅방을 만들어 보세요.</p>;
  return <nav aria-label="내 채팅방" className="mt-3 max-h-64 space-y-2 overflow-y-auto md:max-h-[60vh]">
    {rooms.data.map((room) => {
      const active = pathname === '/chats/' + room.id;
      return <Link key={room.id} href={'/chats/' + room.id} aria-current={active ? 'page' : undefined}
        className={`block rounded-xl px-4 py-3 ${active ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}>
        <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{room.name ?? '채팅방'}</span>
          {room.unreadCount > 0 && <span aria-label={`안 읽은 메시지 ${room.unreadCount}개`} className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{room.unreadCount > 99 ? '99+' : room.unreadCount}</span>}</span>
        {room.lastMessage && <><span className="mt-1 block truncate text-xs text-slate-600">{room.lastMessage.hasAttachment ? '📎 ' : ''}{room.lastMessage.senderDisplayName}: {room.lastMessage.body}</span>
          <time dateTime={room.lastMessage.createdAt} className="mt-1 block text-[11px] text-slate-400">{new Date(room.lastMessage.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></>}
        <span className="mt-1 block text-xs text-slate-500">{room.memberCount}명 · {room.myRole === 'OWNER' ? '내가 만든 방' : '참여 중'}</span>
      </Link>;
    })}
  </nav>;
}
