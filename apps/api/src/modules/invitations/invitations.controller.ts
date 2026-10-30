import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { acceptInvitationSchema, createInvitationSchema, previewInvitationInputSchema, type AcceptInvitationInput, type CreateInvitationInput } from '@chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CredentialRateGuard, CsrfGuard, MemberGuard, WebOriginGuard } from '../auth/auth.guards';
import type { MemberRequest } from '../auth/session';
import { InvitationsService } from './invitations.service';

@Controller('rooms/:roomId/invitations')
@UseGuards(MemberGuard)
export class RoomInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: MemberRequest) {
    return this.invitations.list(roomId, request.memberAuth.user.id);
  }

  @Post()
  @UseGuards(WebOriginGuard, CsrfGuard, CredentialRateGuard)
  create(@Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(createInvitationSchema)) input: CreateInvitationInput, @Req() request: MemberRequest) {
    return this.invitations.create(roomId, request.memberAuth.user, input.email);
  }

  @Post(':id/resend')
  @HttpCode(200)
  @UseGuards(WebOriginGuard, CsrfGuard, CredentialRateGuard)
  resend(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Param('id', new ParseUUIDPipe()) id: string, @Req() request: MemberRequest) {
    return this.invitations.resend(roomId, id, request.memberAuth.user);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @UseGuards(WebOriginGuard, CsrfGuard)
  revoke(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Param('id', new ParseUUIDPipe()) id: string, @Req() request: MemberRequest) {
    return this.invitations.revoke(roomId, id, request.memberAuth.user.id);
  }
}

@Controller('invitations')
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('preview')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  preview(@Body(new ZodValidationPipe(previewInvitationInputSchema)) input: { token: string }, @Req() request: Request) {
    return this.invitations.preview(input.token, request);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(WebOriginGuard, CredentialRateGuard)
  accept(@Body(new ZodValidationPipe(acceptInvitationSchema)) input: AcceptInvitationInput,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.invitations.accept(input, request, response);
  }
}
