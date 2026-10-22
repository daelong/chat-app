'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { useMemberSession } from '@/features/auth/hooks/use-member-session';
import { getRooms } from '../api/rooms';

export function RoomList() {
  const { data: session } = useMemberSession();
  const pathname = usePathname();
  const rooms = useQuery({ queryKey: ['rooms', session?.user.id], queryFn: ({ signal }) => getRooms(signal), enabled: !!session, retry: false });
  if (rooms.isPending) return <p role="status" className="py-6 text-sm text-slate-500">대화 목록을 불러오고 있어요.</p>;
  if (rooms.isError) return <div className="py-6"><p role="alert" className="text-sm text-red-700">{errorMessage(rooms.error)}</p>
    <Button className="mt-3" onClick={() => { void rooms.refetch(); }}>다시 불러오기</Button></div>;
  if (!rooms.data.length) return <p className="py-6 text-sm leading-6 text-slate-500">아직 참여한 방이 없어요.<br />첫 채팅방을 만들어 보세요.</p>;
  return <nav aria-label="내 채팅방" className="mt-3 max-h-64 space-y-2 overflow-y-auto md:max-h-[60vh]">
    {rooms.data.map((room) => {
      const active = pathname === '/chats/' + room.id;
      return <Link key={room.id} href={'/chats/' + room.id} aria-current={active ? 'page' : undefined}
        className={`block rounded-xl px-4 py-3 ${active ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}>
        <span className="block truncate font-medium">{room.name ?? '채팅방'}</span>
        <span className="mt-1 block text-xs text-slate-500">{room.memberCount}명 · {room.myRole === 'OWNER' ? '내가 만든 방' : '참여 중'}</span>
      </Link>;
    })}
  </nav>;
}
