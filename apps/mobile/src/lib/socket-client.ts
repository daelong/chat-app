import { io, type Socket } from 'socket.io-client';
import { CHAT_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@chat/contracts';
import { joinUrl } from '@chat/utils';
import { API_URL } from './api-client';

export function createSocketClient(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(joinUrl(API_URL, CHAT_NAMESPACE), { autoConnect: false, reconnectionAttempts: 5, timeout: 5000 });
}
