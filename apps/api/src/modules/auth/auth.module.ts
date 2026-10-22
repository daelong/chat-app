import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { CredentialRateGuard, CsrfGuard, MemberGuard, WebOriginGuard } from './auth.guards';
import { GoogleClient } from './google.client';
import { GoogleService } from './google.service';

@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, MemberGuard, WebOriginGuard, CsrfGuard, CredentialRateGuard, GoogleClient, GoogleService],
  exports: [MemberGuard, WebOriginGuard, CsrfGuard, AuthService],
})
export class AuthModule {}
