import { ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { GoogleClient } from './google.client';
import { hashSessionToken, newSessionToken, validCsrf } from './session';

const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
export const googleCookieName = (environment: Environment) =>
  environment.NODE_ENV === 'production' ? '__Host-chat_google_state' : 'chat_google_state';

@Injectable()
export class GoogleService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly auth: AuthService,
    private readonly client: GoogleClient,
    @Inject(APP_ENVIRONMENT) private readonly environment: Environment,
  ) {}

  enabled(): boolean { return !!this.environment.GOOGLE_CLIENT_ID; }

  webUrl(path: string): string {
    return new URL(path, this.environment.GOOGLE_REDIRECT_URI ?? this.environment.WEB_ORIGINS[0]!).toString();
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.environment.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
  }

  async start(origin: string | undefined, response: Response) {
    if (!this.enabled()) throw new ServiceUnavailableException('구글 로그인이 아직 설정되지 않았습니다.');
    if (origin !== new URL(this.environment.GOOGLE_REDIRECT_URI!).origin) {
      throw new ForbiddenException({ message: `구글 로그인은 ${this.webUrl('/login')}에서 시작해 주세요.` });
    }
    const state = newSessionToken();
    const codeVerifier = newSessionToken();
    await this.repository.createGoogleAttempt(hashSessionToken(state), codeVerifier, new Date(Date.now() + ATTEMPT_LIFETIME_MS));
    response.cookie(googleCookieName(this.environment), state, { ...this.cookieOptions(), maxAge: ATTEMPT_LIFETIME_MS });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.environment.GOOGLE_CLIENT_ID!,
      redirect_uri: this.environment.GOOGLE_REDIRECT_URI!, state, nonce: state, scope: 'openid profile',
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'), code_challenge_method: 'S256',
      prompt: 'select_account' }).toString();
    return { authorizationUrl: url.toString() };
  }

  async consume(request: Request, response: Response): Promise<{ nonce: string; codeVerifier: string }> {
    const name = googleCookieName(this.environment);
    const cookies = (request.headers.cookie ?? '').split(';').map((value) => value.trim()).filter((value) => value.startsWith(name + '='));
    const expected = cookies.length === 1 ? cookies[0]!.slice(name.length + 1) : '';
    response.clearCookie(name, this.cookieOptions());
    const state = request.query.state;
    if (!this.enabled() || !/^[a-f0-9]{64}$/.test(expected) || typeof state !== 'string' || !validCsrf(state, expected)) {
      throw new UnauthorizedException('구글 로그인 요청을 다시 시작해 주세요.');
    }
    const codeVerifier = await this.repository.consumeGoogleAttempt(hashSessionToken(state));
    if (!codeVerifier) throw new UnauthorizedException('구글 로그인 요청이 만료되었습니다.');
    return { nonce: state, codeVerifier };
  }

  async complete(code: unknown, attempt: { nonce: string; codeVerifier: string }): Promise<string> {
    if (typeof code !== 'string' || !code || code.length > 4096) throw new UnauthorizedException('인가 코드가 없습니다.');
    return this.auth.loginWithGoogle(await this.client.getIdentity(code, attempt));
  }
}
