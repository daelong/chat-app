import { API_ROUTES, roomListSchema, roomSchema, type CreateRoomInput } from '@chat/contracts';
import { apiGet, apiPost } from '@/lib/api-client';

export const getRooms = (signal?: AbortSignal) => apiGet(API_ROUTES.rooms, roomListSchema, signal);
export const getRoom = (id: string, signal?: AbortSignal) => apiGet(API_ROUTES.room(id), roomSchema, signal);
export const createRoom = (input: CreateRoomInput, csrfToken: string) => apiPost(API_ROUTES.rooms, input, roomSchema, csrfToken);
