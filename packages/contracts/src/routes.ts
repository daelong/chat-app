export const API_PREFIX = '/api/v1';
export const API_ROUTES = {
  health: `${API_PREFIX}/health`,
  readiness: `${API_PREFIX}/health/ready`,
  signUp: `${API_PREFIX}/auth/sign-up`,
  login: `${API_PREFIX}/auth/login`,
  refresh: `${API_PREFIX}/auth/refresh`,
  logout: `${API_PREFIX}/auth/logout`,
  authProviders: `${API_PREFIX}/auth/providers`,
  googleStart: `${API_PREFIX}/auth/google`,
  googleCallback: `${API_PREFIX}/auth/google/callback`,
  me: `${API_PREFIX}/users/me`,
  rooms: `${API_PREFIX}/rooms`,
  room: (id: string) => `${API_PREFIX}/rooms/${encodeURIComponent(id)}`,
  messages: (id: string) => `${API_PREFIX}/rooms/${encodeURIComponent(id)}/messages`,
} as const;
export const CHAT_NAMESPACE = '/chat';
