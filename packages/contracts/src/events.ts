import { z } from 'zod';
import type { Health } from './health';
import type { Message, ReadMessageInput, SendMessageInput } from './messages';
import type { RoomSubscription } from './rooms';

export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export const systemPingSchema = z.object({}).strict();

// system:ping만 현재 구현되어 있습니다. 채팅 이벤트는 후속 구현의 계약입니다.
export interface ClientToServerEvents {
  'system:ping': (payload: Record<string, never>, ack: (result: Ack<Health>) => void) => void;
  'room:join': (payload: RoomSubscription, ack: (result: Ack<void>) => void) => void;
  'room:leave': (payload: RoomSubscription, ack: (result: Ack<void>) => void) => void;
  'message:send': (payload: SendMessageInput, ack: (result: Ack<Message>) => void) => void;
  'message:read': (payload: ReadMessageInput, ack: (result: Ack<void>) => void) => void;
}
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:read-updated': (payload: ReadMessageInput & { userId: string }) => void;
}
