import { ForbiddenException, Injectable } from '@nestjs/common';
import type { MessagePageQuery, SendMessageInput } from '@chat/contracts';
import { MessageBroadcaster } from './message-broadcaster';
import { MessagesRepository } from './messages.repository';
import type { ChatIdentity } from './room-access.service';

@Injectable()
export class MessagesService {
  constructor(private readonly repository: MessagesRepository, private readonly broadcaster: MessageBroadcaster) {}
  list(identity: ChatIdentity, query: MessagePageQuery) { return this.repository.list(identity, query); }
  async send(identity: ChatIdentity, input: SendMessageInput) {
    if (input.roomId !== identity.roomId) throw new ForbiddenException({ message: '다른 방으로 메시지를 보낼 수 없습니다.' });
    const result = await this.repository.save(identity, input);
    if (result.created) await this.broadcaster.publish(result.message);
    return result.message;
  }
}
