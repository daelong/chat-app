import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string, userId: string, displayName: string) {
    return this.prisma.chatRoom.create({
      data: { name, type: 'GROUP', members: { create: { userId, displayName, kind: 'MEMBER', role: 'OWNER' } } },
      include: { members: true, _count: { select: { members: { where: { leftAt: null } } } } },
    });
  }

  list(userId: string) {
    return this.prisma.chatRoom.findMany({
      where: { members: { some: { userId, kind: 'MEMBER', leftAt: null } } },
      include: { members: { where: { userId, leftAt: null } }, _count: { select: { members: { where: { leftAt: null } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findForMember(id: string, userId: string) {
    return this.prisma.chatRoom.findFirst({
      where: { id, members: { some: { userId, kind: 'MEMBER', leftAt: null } } },
      include: { members: { where: { userId, leftAt: null } }, _count: { select: { members: { where: { leftAt: null } } } } },
    });
  }
}
