import { Pressable, StyleSheet, Text } from 'react-native';

export function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.label}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  button: { padding: 14, backgroundColor: '#4f46e5', borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 }, label: { color: '#fff', fontWeight: '600' },
});
