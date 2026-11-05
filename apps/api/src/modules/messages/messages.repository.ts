import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type {
  Message,
  MessagePageQuery,
  MessageSearchQuery,
  SendMessageInput,
} from "@chat/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import { RoomAccessService, type ChatIdentity } from "./room-access.service";

const sender = { select: { displayName: true, kind: true } } as const;
const include = { sender, attachments: true } as const;
type StoredMessage = Prisma.MessageGetPayload<{ include: typeof include }>;
export interface StoredFile {
  objectKey: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
}
function safeSequence(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ConflictException({
      message: "메시지 순번 범위를 초과했습니다.",
    });
  return Number(value);
}
function view(message: StoredMessage): Message {
  return {
    messageId: message.id,
    roomId: message.roomId,
    senderMemberId: message.senderMemberId,
    senderDisplayName: message.sender.displayName,
    senderKind: message.sender.kind,
    clientMessageId: message.clientMessageId,
    body: message.body,
    seq: safeSequence(message.seq),
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map(
      ({ id, filename, mimeType, size }) => ({ id, filename, mimeType, size })
    ),
  };
}

@Injectable()
export class MessagesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoomAccessService
  ) {}

  async list(identity: ChatIdentity, query: MessagePageQuery) {
    return this.prisma.$transaction(
      async (transaction) => {
        const participant = await this.access.authorize(identity, transaction);
        const room = await transaction.chatRoom.findUniqueOrThrow({
          where: { id: identity.roomId },
          select: { lastSeq: true },
        });
        const forward = query.afterSeq !== undefined;
        if (query.aroundSeq !== undefined) {
          const before = await transaction.message.findMany({
            where: {
              roomId: identity.roomId,
              seq: { lte: BigInt(query.aroundSeq) },
            },
            orderBy: { seq: "desc" },
            take: Math.ceil(query.limit / 2),
            include,
          });
          const after = await transaction.message.findMany({
            where: {
              roomId: identity.roomId,
              seq: { gt: BigInt(query.aroundSeq) },
            },
            orderBy: { seq: "asc" },
            take: Math.floor(query.limit / 2),
            include,
          });
          const items = [...before.reverse(), ...after];
          const older = items[0]
            ? await transaction.message.count({
                where: { roomId: identity.roomId, seq: { lt: items[0].seq } },
              })
            : 0;
          return {
            items: items.map(view),
            hasMore: older > 0,
            lastSeq: safeSequence(room.lastSeq),
            participant,
          };
        }
        const records = await transaction.message.findMany({
          where: {
            roomId: identity.roomId,
            ...(forward
              ? { seq: { gt: BigInt(query.afterSeq!) } }
              : query.beforeSeq !== undefined
              ? { seq: { lt: BigInt(query.beforeSeq) } }
              : {}),
          },
          orderBy: { seq: forward ? "asc" : "desc" },
          take: query.limit + 1,
          include,
        });
        const items = records.slice(0, query.limit).map(view);
        return {
          items: forward ? items : items.reverse(),
          hasMore: records.length > query.limit,
          lastSeq: safeSequence(room.lastSeq),
          participant,
        };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }

  async save(
    identity: ChatIdentity,
    input: SendMessageInput,
    file?: StoredFile
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.access.authorize(identity, transaction);
        // 같은 방의 저장을 직렬화해 순번과 재전송 ID를 함께 보호합니다.
        await transaction.chatRoom.update({
          where: { id: identity.roomId },
          data: { lastSeq: { increment: 0 } },
          select: { id: true },
        });
        const participant = await this.access.authorize(identity, transaction);
        const previous = await transaction.message.findUnique({
          where: {
            roomId_senderMemberId_clientMessageId: {
              roomId: identity.roomId,
              senderMemberId: participant.id,
              clientMessageId: input.clientMessageId,
            },
          },
          include,
        });
        if (previous) {
          const oldFile = previous.attachments[0];
          if (
            previous.body !== input.body ||
            !!oldFile !== !!file ||
            (file &&
              oldFile &&
              (oldFile.sha256 !== file.sha256 ||
                oldFile.filename !== file.filename ||
                oldFile.mimeType !== file.mimeType))
          ) {
            throw new ConflictException({
              message: "같은 메시지 ID로 다른 내용을 보낼 수 없습니다.",
            });
          }
          return { message: view(previous), created: false };
        }
        const room = await transaction.chatRoom.update({
          where: { id: identity.roomId },
          data: { lastSeq: { increment: 1 }, lastActivityAt: new Date() },
          select: { lastSeq: true },
        });
        safeSequence(room.lastSeq);
        const message = await transaction.message.create({
          data: {
            roomId: identity.roomId,
            senderMemberId: participant.id,
            clientMessageId: input.clientMessageId,
            body: input.body,
            seq: room.lastSeq,
            ...(file ? { attachments: { create: file } } : {}),
          },
          include,
        });
        return { message: view(message), created: true };
      },
      { maxWait: 5000, timeout: 10000 }
    );
  }

  async read(identity: ChatIdentity, lastReadSeq: number) {
    return this.prisma.$transaction(async (transaction) => {
      await this.access.authorize(identity, transaction);
      await transaction.chatRoom.update({
        where: { id: identity.roomId },
        data: { lastSeq: { increment: 0 } },
        select: { id: true },
      });
      const participant = await this.access.authorize(identity, transaction);
      const room = await transaction.chatRoom.findUniqueOrThrow({
        where: { id: identity.roomId },
        select: { lastSeq: true },
      });
      if (BigInt(lastReadSeq) > room.lastSeq)
        throw new BadRequestException({
          message: "아직 존재하지 않는 메시지는 읽음 처리할 수 없습니다.",
        });
      await transaction.roomMember.updateMany({
        where: { id: participant.id, lastReadSeq: { lt: BigInt(lastReadSeq) } },
        data: { lastReadSeq: BigInt(lastReadSeq) },
      });
      const updated = await transaction.roomMember.findUniqueOrThrow({
        where: { id: participant.id },
        select: { lastReadSeq: true },
      });
      return {
        roomId: identity.roomId,
        memberId: participant.id,
        lastReadSeq: safeSequence(updated.lastReadSeq),
      };
    });
  }

  async search(identity: ChatIdentity, query: MessageSearchQuery) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.access.authorize(identity, transaction);
        // Prisma의 contains는 LIKE를 사용하므로 검색어의 와일드카드를 문자 그대로 처리합니다.
        const term = query.q.replace(
          /[\\%_]/g,
          (character) => "\\" + character
        );
        const items = await transaction.message.findMany({
          where: {
            roomId: identity.roomId,
            body: { contains: term, mode: "insensitive" },
            ...(query.beforeSeq === undefined
              ? {}
              : { seq: { lt: BigInt(query.beforeSeq) } }),
          },
          orderBy: { seq: "desc" },
          take: query.limit + 1,
          include,
        });
        return {
          items: items.slice(0, query.limit).map(view),
          hasMore: items.length > query.limit,
        };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }
}
