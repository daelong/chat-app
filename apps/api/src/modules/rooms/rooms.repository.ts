import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

const include = (userId: string) => ({ members: { where: { userId, leftAt: null } },
  messages: { orderBy: { seq: 'desc' as const }, take: 1, include: { sender: { select: { displayName: true } }, attachments: { select: { id: true } } } },
  _count: { select: { members: { where: { leftAt: null } } } },
});
@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, userId: string, displayName: string) {
    const room = await this.prisma.chatRoom.create({
      data: { name, type: 'GROUP', members: { create: { userId, displayName, kind: 'MEMBER', role: 'OWNER' } } },
      include: include(userId),
    });
    return { ...room, unreadCount: 0 };
  }

  async list(userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const rooms = await transaction.chatRoom.findMany({
      where: { members: { some: { userId, kind: 'MEMBER', leftAt: null } } },
      include: include(userId),
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    });
      return Promise.all(rooms.map(async (room) => ({ ...room, unreadCount: await transaction.message.count({
        where: { roomId: room.id, seq: { gt: room.members[0]!.lastReadSeq }, senderMemberId: { not: room.members[0]!.id } },
      }) })));
    }, { isolationLevel: 'RepeatableRead' });
  }

  async findForMember(id: string, userId: string) {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id, members: { some: { userId, kind: 'MEMBER', leftAt: null } } },
      include: include(userId),
    });
    if (!room) return null;
    return { ...room, unreadCount: await this.prisma.message.count({ where: { roomId: id,
      seq: { gt: room.members[0]!.lastReadSeq }, senderMemberId: { not: room.members[0]!.id } } }) };
  }
}
