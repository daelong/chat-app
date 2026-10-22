import { ConversationPlaceholder } from '@/features/messages/components/conversation-placeholder';
import { ServiceStatus } from '@/features/system/components/service-status';

export function ChatPanel({ roomId }: { roomId?: string }) {
  return <main className="flex flex-1 items-center justify-center px-6 py-12"><div className="w-full max-w-lg">
    <ConversationPlaceholder roomId={roomId} /><ServiceStatus />
  </div></main>;
}
