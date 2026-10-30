import type { Metadata } from 'next';
import { GuestRoom } from '@/features/invitations/components/guest-room';

export const metadata: Metadata = { title: '초대받은 방 · Chat App', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function GuestRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <GuestRoom roomId={roomId} />;
}
