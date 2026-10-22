import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { createSocketClient } from '@/lib/socket-client';
import { getHealth, getReadiness } from '../api/health';

export function useServiceStatus() {
  const api = useQuery({ queryKey: ['system', 'api'], queryFn: ({ signal }) => getHealth(signal) });
  const database = useQuery({ queryKey: ['system', 'database'], queryFn: ({ signal }) => getReadiness(signal), retry: false });
  const [socketStatus, setSocketStatus] = useState('확인 중');

  useEffect(() => {
    const socket = createSocketClient();
    socket.on('connect', () => socket.timeout(5000).emit('system:ping', {}, (error, ack) => {
      if (socket.connected) setSocketStatus(!error && ack?.ok ? '연결됨' : '연결 안 됨');
    }));
    socket.on('disconnect', () => setSocketStatus('연결 안 됨'));
    socket.on('connect_error', () => setSocketStatus('연결 안 됨'));
    if (AppState.currentState === 'active') socket.connect();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') socket.connect();
      else socket.disconnect();
    });
    return () => { subscription.remove(); socket.removeAllListeners(); socket.disconnect(); };
  }, []);

  return { api, database, socketStatus };
}
