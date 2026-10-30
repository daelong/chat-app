import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { InvitationDeliveryMode } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';

const unavailable = () => new GoneException({ code: 'INVITATION_UNAVAILABLE', message: '만료되었거나 취소·사용된 초대입니다. 새 초대를 요청해 주세요.' });

@Injectable()
export class InvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  ownerRoom(roomId: string, userId: string) {
    return this.prisma.chatRoom.findFirst({ where: { id: roomId,
      members: { some: { userId, kind: 'MEMBER', role: 'OWNER', leftAt: null } } } });
  }

  list(roomId: string) { return this.prisma.invitation.findMany({ where: { roomId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }); }

  create(input: { roomId: string; inviterId: string; email: string; tokenHash: string; expiresAt: Date; deliveryMode: InvitationDeliveryMode }) {
    return this.prisma.invitation.create({ data: { ...input, deliveryAttemptId: randomUUID(), lastAttemptAt: new Date(), deliveryStatus: 'SENDING' } });
  }

  async resend(roomId: string, id: string, tokenHash: string, expiresAt: Date, deliveryMode: InvitationDeliveryMode) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.invitation.updateMany({ where: { id, roomId }, data: { id } });
      const invitation = await transaction.invitation.findFirst({ where: { id, roomId } });
      if (!invitation) throw new NotFoundException('초대를 찾을 수 없습니다.');
      if (invitation.acceptedAt || invitation.revokedAt) throw unavailable();
      if (invitation.deliveryStatus !== 'FAILED' && invitation.lastAttemptAt.getTime() > Date.now() - 60_000) {
        throw new ConflictException({ message: '재전송은 마지막 발송 시도 1분 후에 할 수 있습니다.' });
      }
      return transaction.invitation.update({ where: { id }, data: { tokenHash, expiresAt, deliveryMode,
        deliveryStatus: 'SENDING', deliveryAttemptId: randomUUID(), lastAttemptAt: new Date(), deliveryError: null, sentAt: null } });
    });
  }

  async finishDelivery(id: string, attemptId: string, error: string | null) {
    await this.prisma.invitation.updateMany({ where: { id, deliveryAttemptId: attemptId },
      data: { deliveryStatus: error ? 'FAILED' : 'SENT', deliveryError: error, sentAt: error ? null : new Date() } });
    return this.prisma.invitation.findUniqueOrThrow({ where: { id } });
  }

  async revoke(roomId: string, id: string) {
    const changed = await this.prisma.invitation.updateMany({ where: { id, roomId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const invitation = await this.prisma.invitation.findFirst({ where: { id, roomId } });
    if (!invitation) throw new NotFoundException('초대를 찾을 수 없습니다.');
    if (!changed.count && !invitation.revokedAt) throw new ConflictException({ message: '이미 수락한 초대는 취소할 수 없습니다.' });
    return invitation;
  }

  byToken(tokenHash: string) {
    return this.prisma.invitation.findUnique({ where: { tokenHash }, include: {
      inviter: { select: { displayName: true } }, room: { include: { members: { where: { kind: 'MEMBER', role: 'OWNER', leftAt: null }, select: { userId: true } } } },
    } });
  }

  async accept(tokenHash: string, displayName: string, session: { tokenHash: string; expiresAt: Date }, previousTokenHash?: string) {
    return this.prisma.$transaction(async (transaction) => {
      // 같은 값을 쓰는 UPDATE로 행을 잠급니다. Prisma가 테스트·운영 스키마를 동일하게 처리합니다.
      await transaction.invitation.updateMany({ where: { tokenHash }, data: { tokenHash } });
      const invitation = await transaction.invitation.findUnique({ where: { tokenHash }, include: { room: { include: { members: {
        where: { kind: 'MEMBER', role: 'OWNER', leftAt: null }, select: { userId: true },
      } } } } });
      if (!invitation) throw new NotFoundException({ message: '유효한 초대 링크를 확인해 주세요.' });
      if (invitation.acceptedMemberId && previousTokenHash) {
        const previous = await transaction.guestSession.findFirst({ where: { tokenHash: previousTokenHash,
          roomId: invitation.roomId, memberId: invitation.acceptedMemberId, expiresAt: { gt: new Date() },
          member: { kind: 'GUEST', leftAt: null } } });
        if (previous) return { roomId: invitation.roomId, resumed: true, expiresAt: previous.expiresAt };
      }
      if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now() ||
        !invitation.room.members.some((member) => member.userId === invitation.inviterId)) throw unavailable();
      const member = await transaction.roomMember.create({ data: { roomId: invitation.roomId, kind: 'GUEST', displayName, role: 'MEMBER' } });
      await transaction.guestSession.create({ data: { ...session, memberId: member.id, roomId: invitation.roomId } });
      await transaction.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), acceptedMemberId: member.id } });
      return { roomId: invitation.roomId, resumed: false, expiresAt: session.expiresAt };
    });
  }
}
