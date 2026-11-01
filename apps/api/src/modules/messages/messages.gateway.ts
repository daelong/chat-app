import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
} from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import {
  CHAT_NAMESPACE,
  chatSocketAuthSchema,
  roomSubscriptionSchema,
  sendMessageSchema,
  readMessageSchema,
  type Ack,
} from "@chat/contracts";
import { z } from "zod";
import { APP_ENVIRONMENT, type Environment } from "../../config/environment";
import { MessageBroadcaster } from "./message-broadcaster";
import { MessagesService } from "./messages.service";
import { RoomAccessService } from "./room-access.service";

@WebSocketGateway({ namespace: CHAT_NAMESPACE })
export class MessagesGateway implements OnGatewayDisconnect {
  constructor(
    private readonly access: RoomAccessService,
    private readonly messages: MessagesService,
    private readonly broadcaster: MessageBroadcaster,
    @Inject(APP_ENVIRONMENT) private readonly environment: Environment
  ) {}

  private async result<T>(action: () => Promise<T>): Promise<Ack<T>> {
    try {
      return { ok: true, data: await action() };
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const body = error instanceof HttpException ? error.getResponse() : null;
      return {
        ok: false,
        error: {
          status,
          code: `HTTP_${status}`,
          message:
            status < 500 &&
            typeof body === "object" &&
            body &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "메시지를 처리하지 못했습니다. 다시 시도해 주세요.",
        },
      };
    }
  }

  @SubscribeMessage("room:join")
  join(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.result(async () => {
      const input = roomSubscriptionSchema.safeParse(payload);
      const auth = chatSocketAuthSchema.safeParse(socket.handshake.auth);
      if (!input.success || !auth.success)
        throw new BadRequestException({
          message: "방과 인증 정보를 확인해 주세요.",
        });
      if (
        !this.environment.WEB_ORIGINS.includes(
          socket.handshake.headers.origin ?? ""
        ) ||
        input.data.roomId !== auth.data.roomId
      ) {
        throw new ForbiddenException({
          message: "허용되지 않은 채팅 연결입니다.",
        });
      }
      const identity = this.access.credentials(
        input.data.roomId,
        auth.data.kind,
        { headers: socket.handshake.headers },
        auth.data.csrfToken
      );
      const participant = await this.access.authorize(identity);
      this.broadcaster.subscribe(socket, identity);
      return participant;
    });
  }

  @SubscribeMessage("room:leave")
  leave(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.result(async () => {
      const input = roomSubscriptionSchema.safeParse(payload);
      if (!input.success) throw new BadRequestException();
      const identity = this.broadcaster.identity(socket.id);
      if (identity && identity.roomId !== input.data.roomId)
        throw new ForbiddenException();
      this.broadcaster.unsubscribe(socket.id);
    });
  }

  @SubscribeMessage("message:send")
  send(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.result(async () => {
      const input = sendMessageSchema.safeParse(payload);
      if (!input.success)
        throw new BadRequestException({
          message: "메시지를 1~4000자로 입력해 주세요.",
        });
      const identity = this.broadcaster.identity(socket.id);
      if (!identity)
        throw new ForbiddenException({
          message: "먼저 참여할 방에 연결해 주세요.",
        });
      return this.messages.send(identity, input.data);
    });
  }
  @SubscribeMessage("message:read")
  read(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.result(async () => {
      const input = readMessageSchema.safeParse(payload);
      if (!input.success) throw new BadRequestException();
      const identity = this.broadcaster.identity(socket.id);
      if (!identity) throw new ForbiddenException();
      await this.messages.read(identity, input.data);
    });
  }
  @SubscribeMessage("rooms:subscribe")
  feed(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.result(async () => {
      const input = z
        .object({ csrfToken: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .safeParse(payload);
      if (!input.success) throw new BadRequestException();
      if (
        !this.environment.WEB_ORIGINS.includes(
          socket.handshake.headers.origin ?? ""
        )
      )
        throw new ForbiddenException();
      const identity = this.access.credentials(
        "",
        "MEMBER",
        { headers: socket.handshake.headers },
        input.data.csrfToken
      );
      await this.access.memberUser(identity.tokenHash);
      this.broadcaster.subscribeFeed(socket, identity.tokenHash);
    });
  }
  handleDisconnect(socket: Socket) {
    this.broadcaster.unsubscribe(socket.id);
  }
}
