import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { MessageBroadcaster } from '../messages/message-broadcaster';
import { RoomAccessService, type ChatIdentity } from '../messages/room-access.service';

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService, private readonly access: RoomAccessService, private readonly broadcaster: MessageBroadcaster) {}

  async list(identity: ChatIdentity) {
    return this.prisma.$transaction(async (transaction) => {
      const me = await this.access.authorize(identity, transaction);
      const items = await transaction.roomMember.findMany({ where: { roomId: identity.roomId, leftAt: null },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], select: { id: true, displayName: true, kind: true, role: true, lastReadSeq: true } });
      return { me, items: items.map((item) => ({ ...item, lastReadSeq: Number(item.lastReadSeq) })) };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async leave(identity: ChatIdentity, targetId?: string) {
    await this.prisma.$transaction(async (transaction) => {
      await this.access.authorize(identity, transaction);
      await transaction.chatRoom.update({ where: { id: identity.roomId }, data: { lastSeq: { increment: 0 } }, select: { id: true } });
      const me = await this.access.authorize(identity, transaction);
      const target = targetId ? await transaction.roomMember.findFirst({ where: { id: targetId, roomId: identity.roomId, leftAt: null } }) : me;
      if (!target) throw new NotFoundException({ message: '참여자를 찾을 수 없습니다.' });
      if (targetId && (me.role !== 'OWNER' || me.kind !== 'MEMBER' || target.id === me.id || target.role === 'OWNER')) {
        throw new ForbiddenException({ message: '방장만 다른 참여자를 내보낼 수 있습니다.' });
      }
      if (target.role === 'OWNER' && await transaction.roomMember.count({ where: { roomId: identity.roomId, leftAt: null } }) > 1) {
        throw new ConflictException({ message: '방장은 다른 참여자가 모두 나간 후에 나갈 수 있습니다.' });
      }
      await transaction.roomMember.update({ where: { id: target.id }, data: { leftAt: new Date() } });
      await transaction.guestSession.deleteMany({ where: { memberId: target.id } });
      if (target.role === 'OWNER') await transaction.invitation.updateMany({ where: { roomId: identity.roomId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.broadcaster.revalidateRoom(identity.roomId);
    await this.broadcaster.changed(identity.roomId, undefined, true);
    return { ok: true };
  }
}
