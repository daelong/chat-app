import { z } from 'zod';
import type { Health } from './health';
import type { ChatParticipant, Message, ReadMessageInput, ReadUpdate, SendMessageInput } from './messages';
import type { RoomSubscription } from './rooms';

export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; status?: number } };
export const systemPingSchema = z.object({}).strict();

export interface ClientToServerEvents {
  'system:ping': (payload: Record<string, never>, ack: (result: Ack<Health>) => void) => void;
  'room:join': (payload: RoomSubscription, ack: (result: Ack<ChatParticipant>) => void) => void;
  'room:leave': (payload: RoomSubscription, ack: (result: Ack<void>) => void) => void;
  'message:send': (payload: SendMessageInput, ack: (result: Ack<Message>) => void) => void;
  'message:read': (payload: ReadMessageInput, ack: (result: Ack<void>) => void) => void;
  'rooms:subscribe': (payload: { csrfToken: string }, ack: (result: Ack<void>) => void) => void;
}
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'chat:access-revoked': (payload: { message: string }) => void;
  'message:read-updated': (payload: ReadUpdate) => void;
  'room:updated': (payload: { roomId: string }) => void;
  'room:participants-updated': (payload: { roomId: string }) => void;
}
