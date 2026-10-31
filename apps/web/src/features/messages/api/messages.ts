import { API_ROUTES, messagePageSchema, messageSchema, type ChatSocketAuth, type SendMessageInput } from '@chat/contracts';
import { apiGet, apiPost } from '@/lib/api-client';

const path = (roomId: string, kind: ChatSocketAuth['kind']) => kind === 'MEMBER' ? API_ROUTES.messages(roomId) : API_ROUTES.guestMessages(roomId);
export function getMessages(roomId: string, kind: ChatSocketAuth['kind'], query: { beforeSeq?: number; afterSeq?: number; limit?: number }, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return apiGet(path(roomId, kind) + '?' + params, messagePageSchema, signal);
}
export const postMessage = (kind: ChatSocketAuth['kind'], input: SendMessageInput, csrf: string) => apiPost(path(input.roomId, kind), input, messageSchema, csrf);
