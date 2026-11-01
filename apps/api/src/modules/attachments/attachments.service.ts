import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/database/prisma.service';
import { MessageBroadcaster } from '../messages/message-broadcaster';
import { MessagesRepository } from '../messages/messages.repository';
import { RoomAccessService, type ChatIdentity } from '../messages/room-access.service';
import { validateFile, type UploadedAttachment } from './file-validation';
import { ObjectStorage } from './object-storage';

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService, private readonly access: RoomAccessService, private readonly storage: ObjectStorage,
    private readonly messages: MessagesRepository, private readonly broadcaster: MessageBroadcaster) {}
  async upload(identity: ChatIdentity, clientMessageId: string, file?: UploadedAttachment) {
    await this.access.authorize(identity);
    const metadata = validateFile(file);
    const objectKey = identity.roomId + '/' + randomUUID();
    await this.storage.put(objectKey, file!.buffer, metadata.mimeType);
    let result: Awaited<ReturnType<MessagesRepository['save']>>;
    try {
      result = await this.messages.save(identity, { roomId: identity.roomId, clientMessageId, body: metadata.filename }, { ...metadata, objectKey });
    } catch (error) { await this.storage.remove(objectKey); throw error; }
    if (!result.created) await this.storage.remove(objectKey);
    else await this.broadcaster.publish(result.message);
    return result.message;
  }
  async download(identity: ChatIdentity, id: string) {
    await this.access.authorize(identity);
    const file = await this.prisma.attachment.findFirst({ where: { id, roomId: identity.roomId } });
    if (!file) throw new NotFoundException({ message: '파일을 찾을 수 없습니다.' });
    const bytes = await this.storage.get(file.objectKey);
    await this.access.authorize(identity);
    return { bytes, filename: file.filename, mimeType: file.mimeType };
  }
}
