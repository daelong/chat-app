import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';

const tokenSchema = z.object({ id_token: z.string().min(1) });
const profileSchema = z.object({ sub: z.string().min(1).max(255), name: z.string().optional(), nonce: z.string() });

@Injectable()
export class GoogleClient {
  private readonly verifier = new OAuth2Client({ transporterOptions: { timeout: 5000, retry: false } });
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  async getIdentity(code: string, attempt: { nonce: string; codeVerifier: string }): Promise<{ googleId: string; displayName: string }> {
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.environment.GOOGLE_CLIENT_ID!,
          client_secret: this.environment.GOOGLE_CLIENT_SECRET!, redirect_uri: this.environment.GOOGLE_REDIRECT_URI!,
          code, code_verifier: attempt.codeVerifier }),
      });
      if (!tokenResponse.ok) throw new Error('Google token exchange failed');
      const token = tokenSchema.parse(await tokenResponse.json());
      // 공식 라이브러리가 서명·발급자·수신자·만료 시간을 검증합니다.
      const ticket = await this.verifier.verifyIdToken({ idToken: token.id_token, audience: this.environment.GOOGLE_CLIENT_ID! });
      const profile = profileSchema.parse(ticket.getPayload());
      if (profile.nonce !== attempt.nonce) throw new Error('Google nonce mismatch');
      // 이메일 대신 재사용되지 않는 sub로 식별하며 기존 이메일 계정과 자동 연결하지 않습니다.
      return { googleId: profile.sub, displayName: profile.name?.trim().slice(0, 50) || '구글 회원' };
    } catch {
      // 응답 본문에 포함될 수 있는 인가 코드·토큰·비밀키를 오류에 포함하지 않습니다.
      throw new ServiceUnavailableException('구글 로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
    }
  }
}
