'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createSocketClient } from '@/lib/socket-client';
import { getHealth, getReadiness } from '../api/health';

export function useServiceStatus() {
  const api = useQuery({ queryKey: ['system', 'api'], queryFn: ({ signal }) => getHealth(signal) });
  const database = useQuery({ queryKey: ['system', 'database'], queryFn: ({ signal }) => getReadiness(signal), retry: false });
  const [socketStatus, setSocketStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    const socket = createSocketClient();
    socket.on('connect', () => {
      socket.timeout(5000).emit('system:ping', {}, (error, ack) => {
        if (socket.connected) setSocketStatus(!error && ack?.ok ? 'connected' : 'disconnected');
      });
    });
    socket.on('connect_error', () => setSocketStatus('disconnected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, []);

  return { api, database, socketStatus };
}
