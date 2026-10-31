import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { MemberSession } from '@chat/contracts';
import type { Environment } from '../../config/environment';

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const newSessionToken = () => randomBytes(32).toString('hex');
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const csrfForSession = (token: string) => createHmac('sha256', token).update('chat-member-csrf-v1').digest('hex');

export interface MemberContext extends MemberSession { tokenHash: string }
export interface MemberRequest extends Request { memberAuth: MemberContext }

export function cookieName(environment: Environment): string {
  return environment.NODE_ENV === 'production' ? '__Host-chat_member' : 'chat_member';
}

function cookieOptions(environment: Environment): CookieOptions {
  return { httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
}

export function readSessionToken(request: Pick<Request, 'headers'>, environment: Environment): string | undefined {
  const name = cookieName(environment);
  const values = (request.headers.cookie ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(name + '=')).map((part) => part.slice(name.length + 1));
  const token = values[0];
  return values.length === 1 && token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function writeSessionCookie(response: Response, environment: Environment, token: string): void {
  response.cookie(cookieName(environment), token, { ...cookieOptions(environment), maxAge: SESSION_LIFETIME_MS });
}

export function clearSessionCookie(response: Response, environment: Environment): void {
  response.clearCookie(cookieName(environment), cookieOptions(environment));
}

export function validCsrf(supplied: string | undefined, expected: string): boolean {
  return !!supplied && /^[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}
