import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ServiceStatus } from '@/features/system/components/service-status';
import { RoomList } from '@/features/rooms/components/room-list';

export function ChatHome() {
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>새로운 대화의 시작</Text>
    <Text style={styles.description}>웹과 같은 API를 사용하는 모바일 앱입니다. 로그인과 채팅 기능은 다음 단계에서 추가됩니다.</Text>
    <ServiceStatus /><RoomList />
    <Link href="/sign-in" style={styles.link}>로그인 안내</Link>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, gap: 24, backgroundColor: '#f3f6fb' },
  title: { fontSize: 28, fontWeight: '700', marginTop: 20, color: '#1e293b' },
  description: { color: '#64748b', lineHeight: 26 }, link: { color: '#4f46e5' },
});
