import { io, type Socket } from 'socket.io-client';
import { CHAT_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@chat/contracts';
import { joinUrl } from '@chat/utils';

export function createSocketClient(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(joinUrl(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', CHAT_NAMESPACE), {
    autoConnect: false, withCredentials: true, reconnectionAttempts: 5, timeout: 5000,
  });
}
