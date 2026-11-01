import { z } from 'zod';
import { API_ROUTES, messagePageSchema, messageSchema, messageSearchPageSchema, participantListSchema, type ChatSocketAuth, type SendMessageInput } from '@chat/contracts';
import { apiGet, apiPost, parseResponse } from '@/lib/api-client';

const path = (roomId: string, kind: ChatSocketAuth['kind']) => kind === 'MEMBER' ? API_ROUTES.messages(roomId) : API_ROUTES.guestMessages(roomId);
export function getMessages(roomId: string, kind: ChatSocketAuth['kind'], query: { beforeSeq?: number; afterSeq?: number; aroundSeq?: number; limit?: number }, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return apiGet(path(roomId, kind) + '?' + params, messagePageSchema, signal);
}
export const postMessage = (kind: ChatSocketAuth['kind'], input: SendMessageInput, csrf: string) => apiPost(path(input.roomId, kind), input, messageSchema, csrf);
const success = z.object({ ok: z.literal(true) });
export const getParticipants = (roomId: string, kind: ChatSocketAuth['kind'], signal?: AbortSignal) => apiGet(API_ROUTES.participants(roomId, kind), participantListSchema, signal);
export const leaveRoom = (auth: ChatSocketAuth) => apiPost(API_ROUTES.leaveRoom(auth.roomId, auth.kind), {}, success, auth.csrfToken);
export const removeParticipant = (auth: ChatSocketAuth, id: string) => apiPost(API_ROUTES.removeParticipant(auth.roomId, id), {}, success, auth.csrfToken);
export const markRead = (auth: ChatSocketAuth, lastReadSeq: number) => apiPost(path(auth.roomId, auth.kind) + '/read', { roomId: auth.roomId, lastReadSeq }, success, auth.csrfToken);
export function searchMessages(auth: ChatSocketAuth, q: string, beforeSeq?: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q });
  if (beforeSeq !== undefined) params.set('beforeSeq', String(beforeSeq));
  return apiGet(path(auth.roomId, auth.kind) + '/search?' + params, messageSearchPageSchema, signal);
}
export async function uploadFile(auth: ChatSocketAuth, file: File, clientMessageId: string) {
  const form = new FormData(); form.set('clientMessageId', clientMessageId); form.set('file', file);
  const response = await fetch(API_ROUTES.files(auth.roomId, auth.kind), { method: 'POST', body: form,
    credentials: 'include', headers: { 'X-CSRF-Token': auth.csrfToken }, signal: AbortSignal.timeout(60_000) });
  return parseResponse(response, messageSchema);
}
