import { API_ROUTES, guestSessionSchema, invitationListSchema, invitationPreviewSchema, invitationResultSchema, invitationSchema, type AcceptInvitationInput } from '@chat/contracts';
import { apiGet, apiPost } from '@/lib/api-client';

export const getInvitations = (roomId: string, signal?: AbortSignal) => apiGet(API_ROUTES.invitations(roomId), invitationListSchema, signal);
export const createInvitation = (roomId: string, email: string, csrf: string) => apiPost(API_ROUTES.invitations(roomId), { email }, invitationResultSchema, csrf);
export const resendInvitation = (roomId: string, id: string, csrf: string) => apiPost(API_ROUTES.resendInvitation(roomId, id), {}, invitationResultSchema, csrf);
export const revokeInvitation = (roomId: string, id: string, csrf: string) => apiPost(API_ROUTES.revokeInvitation(roomId, id), {}, invitationSchema, csrf);
export const previewInvitation = (token: string) => apiPost(API_ROUTES.previewInvitation, { token }, invitationPreviewSchema);
export const acceptInvitation = (input: AcceptInvitationInput) => apiPost(API_ROUTES.acceptInvitation, input, guestSessionSchema);
export const getGuestRoom = (roomId: string, signal?: AbortSignal) => apiGet(API_ROUTES.guestRoom(roomId), guestSessionSchema, signal);
