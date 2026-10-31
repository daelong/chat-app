import { HttpException, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Socket } from 'socket.io';
import type { Message } from '@chat/contracts';
import { RoomAccessService, type ChatIdentity } from './room-access.service';

@Injectable()
export class MessageBroadcaster implements OnModuleDestroy {
  private readonly subscriptions = new Map<string, { socket: Socket; identity: ChatIdentity }>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private readonly access: RoomAccessService) {
    this.timer = setInterval(() => { void this.revalidate(); }, 15_000);
    this.timer.unref();
  }

  subscribe(socket: Socket, identity: ChatIdentity) { this.subscriptions.set(socket.id, { socket, identity }); }
  unsubscribe(socketId: string) { this.subscriptions.delete(socketId); }
  identity(socketId: string) { return this.subscriptions.get(socketId)?.identity; }

  private async deliver(subscription: { socket: Socket; identity: ChatIdentity }, message?: Message) {
    try {
      await this.access.authorize(subscription.identity);
      if (subscription.socket.connected && this.subscriptions.get(subscription.socket.id) === subscription && message) {
        subscription.socket.emit('message:new', message);
      }
    } catch (error) {
      if (error instanceof HttpException && [401, 403, 404].includes(error.getStatus())) {
        if (this.subscriptions.get(subscription.socket.id) !== subscription) return;
        this.unsubscribe(subscription.socket.id);
        subscription.socket.emit('chat:access-revoked', { message: '로그인이 만료되었거나 이 방의 참여 권한이 없습니다.' });
      }
      // DB 일시 장애에서는 전송하지 않습니다. 누락분은 REST 동기화로 복구합니다.
    }
  }
  async publish(message: Message) {
    await Promise.all([...this.subscriptions.values()].filter((entry) => entry.identity.roomId === message.roomId).map((entry) => this.deliver(entry, message)));
  }
  private async revalidate() { await Promise.all([...this.subscriptions.values()].map((entry) => this.deliver(entry))); }
  onModuleDestroy() { clearInterval(this.timer); this.subscriptions.clear(); }
}
