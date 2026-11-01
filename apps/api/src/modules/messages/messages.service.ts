import { ForbiddenException, Injectable } from '@nestjs/common';
import type { MessagePageQuery, MessageSearchQuery, ReadMessageInput, SendMessageInput } from '@chat/contracts';
import { MessageBroadcaster } from './message-broadcaster';
import { MessagesRepository } from './messages.repository';
import type { ChatIdentity } from './room-access.service';

@Injectable()
export class MessagesService {
  constructor(private readonly repository: MessagesRepository, private readonly broadcaster: MessageBroadcaster) {}
  list(identity: ChatIdentity, query: MessagePageQuery) { return this.repository.list(identity, query); }
  search(identity: ChatIdentity, query: MessageSearchQuery) { return this.repository.search(identity, query); }
  async read(identity: ChatIdentity, input: ReadMessageInput) {
    if (input.roomId !== identity.roomId) throw new ForbiddenException();
    const update = await this.repository.read(identity, input.lastReadSeq);
    await this.broadcaster.changed(identity.roomId, update);
  }
  async send(identity: ChatIdentity, input: SendMessageInput) {
    if (input.roomId !== identity.roomId) throw new ForbiddenException({ message: '다른 방으로 메시지를 보낼 수 없습니다.' });
    const result = await this.repository.save(identity, input);
    if (result.created) await this.broadcaster.publish(result.message);
    return result.message;
  }
}
