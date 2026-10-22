import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema, signUpSchema, type LoginInput, type SignUpInput } from '@chat/contracts';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CredentialRateGuard, CsrfGuard, MemberGuard, WebOriginGuard } from './auth.guards';
import { clearSessionCookie, hashSessionToken, readSessionToken, writeSessionCookie, type MemberRequest } from './session';
import { GoogleService } from './google.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly google: GoogleService, @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  @Get('providers')
  providers() { return { google: this.google.enabled() }; }

  @Post('google')
  @HttpCode(200)
  @UseGuards(WebOriginGuard, CredentialRateGuard)
  startGoogle(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.google.start(request.get('origin'), response);
  }

  @Get('google/callback')
  async googleCallback(@Req() request: Request, @Res() response: Response) {
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const attempt = await this.google.consume(request, response);
      if (request.query.error) return response.redirect(this.google.webUrl(request.query.error === 'access_denied'
        ? '/login?google=cancelled' : '/login?google=failed'));
      const token = await this.google.complete(request.query.code, attempt);
      await this.replaceCookie(request, response, token);
      return response.redirect(this.google.webUrl('/chats'));
    } catch {
      return response.redirect(this.google.webUrl('/login?google=failed'));
    }
  }

  @Post('sign-up')
  @UseGuards(WebOriginGuard, CredentialRateGuard)
  async signUp(@Body(new ZodValidationPipe(signUpSchema)) input: SignUpInput, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.signUp(input);
    await this.replaceCookie(request, response, result.token);
    return result.session;
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(WebOriginGuard, CredentialRateGuard)
  async login(@Body(new ZodValidationPipe(loginSchema)) input: LoginInput, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input);
    await this.replaceCookie(request, response, result.token);
    return result.session;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(MemberGuard, WebOriginGuard, CsrfGuard)
  async logout(@Req() request: MemberRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.memberAuth.tokenHash);
    clearSessionCookie(response, this.environment);
    return { ok: true };
  }

  private async replaceCookie(request: Request, response: Response, token: string): Promise<void> {
    const previous = readSessionToken(request, this.environment);
    if (previous) await this.auth.logout(hashSessionToken(previous));
    writeSessionCookie(response, this.environment, token);
  }
}
