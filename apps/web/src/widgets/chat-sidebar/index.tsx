import Link from 'next/link';
import { RoomList } from '@/features/rooms/components/room-list';

export function ChatSidebar() {
  return <aside className="border-b border-slate-200 bg-white p-5 md:w-64 md:border-r md:border-b-0">
    <Link href="/chats" className="text-xl font-bold tracking-tight text-indigo-700">Chat App</Link>
    <div className="mt-8 hidden md:block"><h2 className="px-4 text-xs font-bold uppercase tracking-widest text-slate-500">대화 목록</h2><RoomList /></div>
    <Link href="/login" className="mt-4 inline-block text-sm text-slate-600 underline">로그인 안내</Link>
  </aside>;
}
