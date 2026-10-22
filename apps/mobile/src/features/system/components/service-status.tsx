import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { useServiceStatus } from '../hooks/use-service-status';

export function ServiceStatus() {
  const { api, database, socketStatus } = useServiceStatus();
  return <View style={styles.card}>
    <Text style={styles.row}>API 서버: {api.isPending ? '확인 중' : api.isError ? '연결 안 됨' : '연결됨'}</Text>
    <Text style={styles.row}>데이터베이스: {database.isPending ? '확인 중' : database.isError ? '연결 안 됨' : '연결됨'}</Text>
    <Text style={styles.row}>실시간 연결: {socketStatus}</Text>
    <Button label="서버 상태 다시 확인" disabled={api.isFetching || database.isFetching}
      onPress={() => { void api.refetch(); void database.refetch(); }} />
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 24, backgroundColor: '#fff', borderRadius: 16, gap: 16, borderColor: '#e2e8f0', borderWidth: 1 },
  row: { color: '#475569', fontSize: 14 },
});
