import {
  HttpException,
  Injectable,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Socket } from "socket.io";
import type { Message, ReadUpdate } from "@chat/contracts";
import { PrismaService } from "../../infra/database/prisma.service";
import { RoomAccessService, type ChatIdentity } from "./room-access.service";

@Injectable()
export class MessageBroadcaster implements OnModuleDestroy {
  private readonly subscriptions = new Map<
    string,
    { socket: Socket; identity: ChatIdentity }
  >();
  private readonly feeds = new Map<
    string,
    { socket: Socket; tokenHash: string }
  >();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly access: RoomAccessService,
    private readonly prisma: PrismaService
  ) {
    this.timer = setInterval(() => {
      void this.revalidate();
    }, 15_000);
    this.timer.unref();
  }

  subscribe(socket: Socket, identity: ChatIdentity) {
    this.subscriptions.set(socket.id, { socket, identity });
  }
  subscribeFeed(socket: Socket, tokenHash: string) {
    this.feeds.set(socket.id, { socket, tokenHash });
  }
  unsubscribe(socketId: string) {
    this.subscriptions.delete(socketId);
    this.feeds.delete(socketId);
  }
  identity(socketId: string) {
    return this.subscriptions.get(socketId)?.identity;
  }

  private async deliver(
    subscription: { socket: Socket; identity: ChatIdentity },
    event?: { name: string; payload: unknown }
  ) {
    try {
      await this.access.authorize(subscription.identity);
      if (
        subscription.socket.connected &&
        this.subscriptions.get(subscription.socket.id) === subscription &&
        event
      ) {
        subscription.socket.emit(event.name, event.payload);
      }
    } catch (error) {
      if (
        error instanceof HttpException &&
        [401, 403, 404].includes(error.getStatus())
      ) {
        if (this.subscriptions.get(subscription.socket.id) !== subscription)
          return;
        this.unsubscribe(subscription.socket.id);
        subscription.socket.emit("chat:access-revoked", {
          message: "로그인이 만료되었거나 이 방의 참여 권한이 없습니다.",
        });
      }
      // DB 일시 장애에서는 전송하지 않습니다. 누락분은 REST 동기화로 복구합니다.
    }
  }
  async publish(message: Message) {
    await this.roomEvent(message.roomId, "message:new", message);
    await this.changed(message.roomId);
  }
  private async roomEvent(roomId: string, name: string, payload: unknown) {
    await Promise.all(
      [...this.subscriptions.values()]
        .filter((entry) => entry.identity.roomId === roomId)
        .map((entry) => this.deliver(entry, { name, payload }))
    );
  }
  async changed(roomId: string, read?: ReadUpdate, participants = false) {
    await this.roomEvent(
      roomId,
      read
        ? "message:read-updated"
        : participants
        ? "room:participants-updated"
        : "room:updated",
      read ?? { roomId }
    );
    await Promise.all(
      [...this.feeds.values()].map(async (entry) => {
        try {
          const userId = await this.access.memberUser(entry.tokenHash);
          const member = await this.prisma.roomMember.findFirst({
            where: { roomId, userId },
            select: { id: true },
          });
          if (
            member &&
            entry.socket.connected &&
            this.feeds.get(entry.socket.id) === entry
          )
            entry.socket.emit("room:updated", { roomId });
        } catch (error) {
          if (error instanceof HttpException && error.getStatus() === 401)
            this.feeds.delete(entry.socket.id);
        }
      })
    );
  }
  async revalidateRoom(roomId: string) {
    await this.roomEvent(roomId, "room:participants-updated", { roomId });
  }
  private async revalidate() {
    await Promise.all(
      [...this.subscriptions.values()].map((entry) => this.deliver(entry))
    );
    await Promise.all(
      [...this.feeds.values()].map(async (entry) => {
        try {
          await this.access.memberUser(entry.tokenHash);
        } catch (error) {
          if (error instanceof HttpException && error.getStatus() === 401)
            this.feeds.delete(entry.socket.id);
        }
      })
    );
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    this.subscriptions.clear();
    this.feeds.clear();
  }
}
