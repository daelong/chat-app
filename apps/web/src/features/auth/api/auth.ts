import { API_ROUTES, authProvidersSchema, googleStartSchema, logoutResultSchema, memberSessionSchema, type LoginInput, type SignUpInput } from '@chat/contracts';
import { ApiError, apiGet, apiPost } from '@/lib/api-client';

export async function getMemberSession(signal?: AbortSignal) {
  try { return await apiGet(API_ROUTES.me, memberSessionSchema, signal); }
  catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
}
export const signUp = (input: SignUpInput) => apiPost(API_ROUTES.signUp, input, memberSessionSchema);
export const login = (input: LoginInput) => apiPost(API_ROUTES.login, input, memberSessionSchema);
export const logout = (csrfToken: string) => apiPost(API_ROUTES.logout, {}, logoutResultSchema, csrfToken);
export const getAuthProviders = () => apiGet(API_ROUTES.authProviders, authProvidersSchema);
export const startGoogle = () => apiPost(API_ROUTES.googleStart, {}, googleStartSchema);
