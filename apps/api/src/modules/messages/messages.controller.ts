import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { messagePageQuerySchema, messageSearchQuerySchema, readMessageSchema, sendMessageSchema,
  type MessagePageQuery, type MessageSearchQuery, type ReadMessageInput, type SendMessageInput } from '@chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WebOriginGuard } from '../auth/auth.guards';
import { MessagesService } from './messages.service';
import { RoomAccessService } from './room-access.service';

@Controller('rooms/:roomId/messages')
export class MemberMessagesController {
  constructor(private readonly access: RoomAccessService, private readonly messages: MessagesService) {}
  @Get('search')
  search(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Query(new ZodValidationPipe(messageSearchQuerySchema)) query: MessageSearchQuery, @Req() request: Request) {
    return this.messages.search(this.access.credentials(roomId, 'MEMBER', request), query);
  }
  @Post('read')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  async read(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Body(new ZodValidationPipe(readMessageSchema)) input: ReadMessageInput, @Req() request: Request) {
    await this.messages.read(this.access.credentials(roomId, 'MEMBER', request, request.get('x-csrf-token') ?? ''), input);
    return { ok: true };
  }
  @Get()
  list(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Query(new ZodValidationPipe(messagePageQuerySchema)) query: MessagePageQuery, @Req() request: Request) {
    return this.messages.list(this.access.credentials(roomId, 'MEMBER', request), query);
  }
  @Post()
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  send(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Body(new ZodValidationPipe(sendMessageSchema)) input: SendMessageInput, @Req() request: Request) {
    return this.messages.send(this.access.credentials(roomId, 'MEMBER', request, request.get('x-csrf-token') ?? ''), input);
  }
}

@Controller('guest/rooms/:roomId/messages')
export class GuestMessagesController {
  constructor(private readonly access: RoomAccessService, private readonly messages: MessagesService) {}
  @Get('search')
  search(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Query(new ZodValidationPipe(messageSearchQuerySchema)) query: MessageSearchQuery, @Req() request: Request) {
    return this.messages.search(this.access.credentials(roomId, 'GUEST', request), query);
  }
  @Post('read')
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  async read(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Body(new ZodValidationPipe(readMessageSchema)) input: ReadMessageInput, @Req() request: Request) {
    await this.messages.read(this.access.credentials(roomId, 'GUEST', request, request.get('x-csrf-token') ?? ''), input);
    return { ok: true };
  }
  @Get()
  list(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Query(new ZodValidationPipe(messagePageQuerySchema)) query: MessagePageQuery, @Req() request: Request) {
    return this.messages.list(this.access.credentials(roomId, 'GUEST', request), query);
  }
  @Post()
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  send(@Param('roomId', new ParseUUIDPipe()) roomId: string, @Body(new ZodValidationPipe(sendMessageSchema)) input: SendMessageInput, @Req() request: Request) {
    return this.messages.send(this.access.credentials(roomId, 'GUEST', request, request.get('x-csrf-token') ?? ''), input);
  }
}
