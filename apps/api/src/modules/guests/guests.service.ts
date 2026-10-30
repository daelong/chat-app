import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { GuestSession } from '@chat/contracts';
import { PrismaService } from '../../infra/database/prisma.service';
import { csrfForSession, hashSessionToken } from '../auth/session';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(roomId: string, token: string | undefined) {
    if (!token) return null;
    const session = await this.prisma.guestSession.findUnique({ where: { tokenHash: hashSessionToken(token) },
      include: { member: { include: { room: { include: { _count: { select: { members: { where: { leftAt: null } } } } } } } } } });
    if (!session || session.roomId !== roomId || session.expiresAt.getTime() <= Date.now() ||
      session.member.kind !== 'GUEST' || session.member.leftAt) return null;
    return session;
  }

  async authenticate(roomId: string, token: string | undefined): Promise<GuestSession> {
    const session = await this.find(roomId, token);
    if (!session || !token) throw new UnauthorizedException({ code: 'GUEST_SESSION_REQUIRED', message: '이 방의 참여 정보가 없거나 만료되었습니다. 초대한 사람에게 새 초대를 요청해 주세요.' });
    return {
      room: { id: roomId, name: session.member.room.name, memberCount: session.member.room._count.members },
      participant: { id: session.memberId, displayName: session.member.displayName, kind: 'GUEST' },
      csrfToken: csrfForSession(token), expiresAt: session.expiresAt.toISOString(),
    };
  }
}
