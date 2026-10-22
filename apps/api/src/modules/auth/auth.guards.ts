import { ForbiddenException, HttpException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { AuthService } from './auth.service';
import { readSessionToken, validCsrf, type MemberRequest } from './session';

@Injectable()
export class MemberGuard implements CanActivate {
  constructor(private readonly auth: AuthService, @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    request.memberAuth = await this.auth.authenticate(readSessionToken(request, this.environment));
    return true;
  }
}

@Injectable()
export class WebOriginGuard implements CanActivate {
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}
  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().get('origin');
    if (!origin || !this.environment.WEB_ORIGINS.includes(origin)) {
      throw new ForbiddenException({ code: 'INVALID_ORIGIN', message: '허용되지 않은 요청입니다.' });
    }
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    if (!request.memberAuth || !validCsrf(request.get('x-csrf-token'), request.memberAuth.csrfToken)) {
      throw new ForbiddenException({ code: 'INVALID_CSRF', message: '화면을 새로고침한 뒤 다시 시도해 주세요.' });
    }
    return true;
  }
}

// Single-server protection for expensive password verification. No proxy headers are trusted.
@Injectable()
export class CredentialRateGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const now = Date.now();
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    let entry = this.attempts.get(key);
    if (!entry || entry.until <= now) {
      for (const [ip, value] of this.attempts) if (value.until <= now) this.attempts.delete(ip);
      if (this.attempts.size >= 10000) throw new HttpException('잠시 후 다시 시도해 주세요.', 429);
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      this.attempts.set(key, entry);
    }
    entry.count++;
    if (entry.count > 30) {
      http.getResponse<Response>().setHeader('Retry-After', Math.ceil((entry.until - now) / 1000));
      throw new HttpException({ code: 'TOO_MANY_ATTEMPTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    }
    return true;
  }
}
