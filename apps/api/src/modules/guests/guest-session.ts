import type { Request, Response } from 'express';
import type { Environment } from '../../config/environment';

export const GUEST_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const guestCookieName = (roomId: string, environment: Environment) =>
  (environment.NODE_ENV === 'production' ? '__Host-chat_guest_' : 'chat_guest_') + roomId.replaceAll('-', '');

export function readGuestToken(request: Pick<Request, 'headers'>, roomId: string, environment: Environment): string | undefined {
  const prefix = guestCookieName(roomId, environment) + '=';
  const cookies = (request.headers.cookie ?? '').split(';').map((value) => value.trim()).filter((value) => value.startsWith(prefix));
  const token = cookies[0]?.slice(prefix.length);
  return cookies.length === 1 && token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function writeGuestCookie(response: Response, roomId: string, token: string, expiresAt: Date, environment: Environment) {
  response.cookie(guestCookieName(roomId, environment), token, {
    httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt,
  });
}
