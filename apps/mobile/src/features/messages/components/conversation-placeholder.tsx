import { Text, View } from 'react-native';

export function ConversationPlaceholder({ roomId }: { roomId: string }) {
  return <View style={{ padding: 24, gap: 16 }}><Text style={{ fontSize: 24, fontWeight: '700' }}>대화 화면</Text>
    <Text>메시지 송수신 기능은 아직 구현 전입니다.</Text><Text>요청한 채팅방: {roomId}</Text></View>;
}
