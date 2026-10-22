import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput, SignUpInput, User } from '@chat/contracts';
import { AuthRepository } from './auth.repository';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';
import { csrfForSession, hashSessionToken, newSessionToken, SESSION_LIFETIME_MS, type MemberContext } from './session';

function accountView(user: { id: string; email: string | null; displayName: string; avatarUrl: string | null; createdAt: Date }): User {
  return { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString() };
}

@Injectable()
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async signUp(input: SignUpInput) {
    const token = newSessionToken();
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.repository.createAccount(
        { email: input.email, displayName: input.displayName, passwordHash },
        hashSessionToken(token), new Date(Date.now() + SESSION_LIFETIME_MS),
      );
      return { token, session: { user: accountView(user), csrfToken: csrfForSession(token) } };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: '이미 가입한 이메일입니다. 로그인해 주세요.' });
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.repository.findAccount(input.email);
    const verified = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !verified) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호를 확인하세요.' });
    const token = newSessionToken();
    await this.repository.createSession(user.id, hashSessionToken(token), new Date(Date.now() + SESSION_LIFETIME_MS));
    return { token, session: { user: accountView(user), csrfToken: csrfForSession(token) } };
  }

  async authenticate(token: string | undefined): Promise<MemberContext> {
    if (!token) throw new UnauthorizedException({ code: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' });
    const tokenHash = hashSessionToken(token);
    const session = await this.repository.findSession(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }
    return { user: accountView(session.user), tokenHash, csrfToken: csrfForSession(token) };
  }

  async loginWithGoogle(identity: { googleId: string; displayName: string }) {
    const token = newSessionToken();
    await this.repository.createGoogleSession(identity, hashSessionToken(token), new Date(Date.now() + SESSION_LIFETIME_MS));
    return token;
  }

  async logout(tokenHash: string): Promise<void> { await this.repository.revokeSession(tokenHash); }
}
