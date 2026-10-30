import { Controller, Get, Inject, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { readGuestToken } from './guest-session';
import { GuestsService } from './guests.service';

@Controller('guest/rooms')
export class GuestsController {
  constructor(private readonly guests: GuestsService, @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  @Get(':roomId')
  room(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Req() request: Request) {
    return this.guests.authenticate(roomId, readGuestToken(request, roomId, this.environment));
  }
}
