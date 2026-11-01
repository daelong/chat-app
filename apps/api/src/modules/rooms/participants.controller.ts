import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { WebOriginGuard } from '../auth/auth.guards';
import { writeGuestCookie } from '../guests/guest-session';
import { RoomAccessService } from '../messages/room-access.service';
import { ParticipantsService } from './participants.service';

@Controller('rooms/:roomId')
export class MemberParticipantsController {
  constructor(private readonly access: RoomAccessService, private readonly participants: ParticipantsService) {}
  @Get('participants')
  list(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: Request) {
    return this.participants.list(this.access.credentials(roomId, 'MEMBER', request));
  }
  @Post('leave')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  leave(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: Request) {
    return this.participants.leave(this.access.credentials(roomId, 'MEMBER', request, request.get('x-csrf-token') ?? ''));
  }
  @Post('participants/:memberId/remove')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  remove(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Param('memberId', new ParseUUIDPipe()) memberId: string, @Req() request: Request) {
    return this.participants.leave(this.access.credentials(roomId, 'MEMBER', request, request.get('x-csrf-token') ?? ''), memberId);
  }
}

@Controller('guest/rooms/:roomId')
export class GuestParticipantsController {
  constructor(private readonly access: RoomAccessService, private readonly participants: ParticipantsService,
    @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}
  @Get('participants')
  list(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: Request) {
    return this.participants.list(this.access.credentials(roomId, 'GUEST', request));
  }
  @Post('leave')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  async leave(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.participants.leave(this.access.credentials(roomId, 'GUEST', request, request.get('x-csrf-token') ?? ''));
    writeGuestCookie(response, roomId, '', new Date(0), this.environment);
    return result;
  }
}
