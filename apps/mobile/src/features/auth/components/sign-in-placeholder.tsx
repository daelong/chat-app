import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export function SignInPlaceholder() {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 20 }}>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>로그인</Text>
    <Text style={{ lineHeight: 26 }}>로그인 경로가 준비되었습니다. 회원가입과 인증 기능은 아직 구현 전입니다.</Text>
    <Link href="/chats" style={{ color: '#4f46e5' }}>시작 화면으로 돌아가기</Link>
  </View>;
}
