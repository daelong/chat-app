import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return <Tabs><Tabs.Screen name="chats/index" options={{ title: '대화', headerTitle: 'Chat App' }} /></Tabs>;
}
