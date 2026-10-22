import { useLocalSearchParams } from 'expo-router';
import { ConversationPlaceholder } from '@/features/messages/components/conversation-placeholder';

export default function ChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return <ConversationPlaceholder roomId={roomId} />;
}
