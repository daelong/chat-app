import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Query, Req, Res,
  SetMetadata, StreamableFile, UploadedFile, UseGuards, UseInterceptors, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { MAX_ATTACHMENT_SIZE } from '@chat/contracts';
import { WebOriginGuard } from '../auth/auth.guards';
import { RoomAccessService, type ChatIdentity } from '../messages/room-access.service';
import { AttachmentsService } from './attachments.service';
import type { UploadedAttachment } from './file-validation';

type FileRequest = Request & { chatIdentity: ChatIdentity };
@Injectable()
export class FileRoomGuard implements CanActivate {
  constructor(private readonly access: RoomAccessService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FileRequest>();
    const parsed = z.uuid().safeParse(request.params.roomId);
    if (!parsed.success) throw new BadRequestException();
    const kind = this.reflector.get<'MEMBER' | 'GUEST'>('chatKind', context.getClass());
    request.chatIdentity = this.access.credentials(parsed.data, kind, request, request.method === 'GET' ? undefined : request.get('x-csrf-token') ?? '');
    await this.access.authorize(request.chatIdentity);
    return true;
  }
}

function stream(file: { bytes: Buffer; filename: string; mimeType: string }, preview: unknown, response: Response) {
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  const encoded = encodeURIComponent(file.filename).replace(/['()*]/g, (value) => '%' + value.charCodeAt(0).toString(16));
  return new StreamableFile(file.bytes, { type: file.mimeType,
    disposition: `${preview === '1' && file.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}` });
}
const uploadOptions = { limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 1, fieldSize: 100, parts: 2 } };
const clientIdSchema = z.object({ clientMessageId: z.uuid() }).strict();

@Controller('rooms/:roomId/files')
@SetMetadata('chatKind', 'MEMBER')
@UseGuards(FileRoomGuard)
export class MemberAttachmentsController {
  constructor(private readonly files: AttachmentsService) {}
  @Post()
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(@Req() request: FileRequest, @Body() body: unknown, @UploadedFile() file?: UploadedAttachment) {
    const input = clientIdSchema.safeParse(body);
    if (!input.success) throw new BadRequestException({ message: '파일 전송 정보를 확인해 주세요.' });
    return this.files.upload(request.chatIdentity, input.data.clientMessageId, file);
  }
  @Get(':id')
  async download(@Req() request: FileRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query('preview') preview: unknown, @Res({ passthrough: true }) response: Response) {
    return stream(await this.files.download(request.chatIdentity, id), preview, response);
  }
}

@Controller('guest/rooms/:roomId/files')
@SetMetadata('chatKind', 'GUEST')
@UseGuards(FileRoomGuard)
export class GuestAttachmentsController {
  constructor(private readonly files: AttachmentsService) {}
  @Post()
  @HttpCode(200)
  @UseGuards(WebOriginGuard)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(@Req() request: FileRequest, @Body() body: unknown, @UploadedFile() file?: UploadedAttachment) {
    const input = clientIdSchema.safeParse(body);
    if (!input.success) throw new BadRequestException({ message: '파일 전송 정보를 확인해 주세요.' });
    return this.files.upload(request.chatIdentity, input.data.clientMessageId, file);
  }
  @Get(':id')
  async download(@Req() request: FileRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query('preview') preview: unknown, @Res({ passthrough: true }) response: Response) {
    return stream(await this.files.download(request.chatIdentity, id), preview, response);
  }
}
