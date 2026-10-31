import { ConflictException, Injectable } from '@nestjs/common';
import type { Message, MessagePageQuery, SendMessageInput } from '@chat/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import { RoomAccessService, type ChatIdentity } from './room-access.service';

const sender = { select: { displayName: true, kind: true } } as const;
type StoredMessage = Prisma.MessageGetPayload<{ include: { sender: typeof sender } }>;
function safeSequence(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException({ message: '메시지 순번 범위를 초과했습니다.' });
  return Number(value);
}
function view(message: StoredMessage): Message {
  return { messageId: message.id, roomId: message.roomId, senderMemberId: message.senderMemberId,
    senderDisplayName: message.sender.displayName, senderKind: message.sender.kind,
    clientMessageId: message.clientMessageId, body: message.body, seq: safeSequence(message.seq), createdAt: message.createdAt.toISOString() };
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService, private readonly access: RoomAccessService) {}

  async list(identity: ChatIdentity, query: MessagePageQuery) {
    return this.prisma.$transaction(async (transaction) => {
      const participant = await this.access.authorize(identity, transaction);
      const room = await transaction.chatRoom.findUniqueOrThrow({ where: { id: identity.roomId }, select: { lastSeq: true } });
      const forward = query.afterSeq !== undefined;
      const records = await transaction.message.findMany({ where: { roomId: identity.roomId,
        ...(forward ? { seq: { gt: BigInt(query.afterSeq!) } } : query.beforeSeq !== undefined ? { seq: { lt: BigInt(query.beforeSeq) } } : {}),
      }, orderBy: { seq: forward ? 'asc' : 'desc' }, take: query.limit + 1, include: { sender } });
      const items = records.slice(0, query.limit).map(view);
      return { items: forward ? items : items.reverse(), hasMore: records.length > query.limit,
        lastSeq: safeSequence(room.lastSeq), participant };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async save(identity: ChatIdentity, input: SendMessageInput) {
    return this.prisma.$transaction(async (transaction) => {
      await this.access.authorize(identity, transaction);
      // 같은 방의 저장을 직렬화해 순번과 재전송 ID를 함께 보호합니다.
      await transaction.chatRoom.update({ where: { id: identity.roomId }, data: { lastSeq: { increment: 0 } }, select: { id: true } });
      const participant = await this.access.authorize(identity, transaction);
      const previous = await transaction.message.findUnique({ where: { roomId_senderMemberId_clientMessageId: {
        roomId: identity.roomId, senderMemberId: participant.id, clientMessageId: input.clientMessageId,
      } }, include: { sender } });
      if (previous) {
        if (previous.body !== input.body) throw new ConflictException({ message: '같은 메시지 ID로 다른 내용을 보낼 수 없습니다.' });
        return { message: view(previous), created: false };
      }
      const room = await transaction.chatRoom.update({ where: { id: identity.roomId }, data: { lastSeq: { increment: 1 } }, select: { lastSeq: true } });
      safeSequence(room.lastSeq);
      const message = await transaction.message.create({ data: { roomId: identity.roomId, senderMemberId: participant.id,
        clientMessageId: input.clientMessageId, body: input.body, seq: room.lastSeq }, include: { sender } });
      return { message: view(message), created: true };
    }, { maxWait: 5000, timeout: 10000 });
  }
}
