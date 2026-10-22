import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createRoomSchema, type CreateRoomInput } from '@chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CsrfGuard, MemberGuard, WebOriginGuard } from '../auth/auth.guards';
import type { MemberRequest } from '../auth/session';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@UseGuards(MemberGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}
  @Get()
  list(@Req() request: MemberRequest) { return this.rooms.list(request.memberAuth.user.id); }
  @Get(':id')
  find(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: MemberRequest) {
    return this.rooms.find(id, request.memberAuth.user.id);
  }
  @Post()
  @UseGuards(WebOriginGuard, CsrfGuard)
  create(@Body(new ZodValidationPipe(createRoomSchema)) input: CreateRoomInput, @Req() request: MemberRequest) {
    return this.rooms.create(input, request.memberAuth.user);
  }
}
