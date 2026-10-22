import { ChatPanel } from '@/widgets/chat-panel';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <ChatPanel roomId={roomId} />;
}
