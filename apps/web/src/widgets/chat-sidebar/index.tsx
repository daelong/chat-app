import Link from 'next/link';
import { RoomList } from '@/features/rooms/components/room-list';
import { AccountMenu } from '@/features/auth/components/account-menu';

export function ChatSidebar() {
  return <aside className="shrink-0 border-b border-slate-200 bg-white p-5 md:w-72 md:border-r md:border-b-0">
    <Link href="/chats" className="text-xl font-bold tracking-tight text-indigo-700">Chat App</Link>
    <Link href="/chats" className="mt-6 block rounded-xl border border-indigo-200 px-4 py-3 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-50">+ 새 채팅방</Link>
    <div className="mt-8"><h2 className="px-4 text-xs font-bold tracking-widest text-slate-500">내 채팅방</h2><RoomList /></div>
    <AccountMenu />
  </aside>;
}
