import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { PrismaService } from '../../infra/database/prisma.service';
import { csrfForSession, hashSessionToken, readSessionToken, validCsrf } from '../auth/session';
import { readGuestToken } from '../guests/guest-session';

export interface ChatIdentity { roomId: string; kind: 'MEMBER' | 'GUEST'; tokenHash: string }

@Injectable()
export class RoomAccessService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  credentials(roomId: string, kind: ChatIdentity['kind'], request: Pick<Request, 'headers'>, csrf?: string): ChatIdentity {
    const token = kind === 'MEMBER' ? readSessionToken(request, this.environment) : readGuestToken(request, roomId, this.environment);
    if (!token) throw new UnauthorizedException({ message: '이 방의 로그인 또는 초대 참여 정보를 확인해 주세요.' });
    if (csrf !== undefined && !validCsrf(csrf, csrfForSession(token))) {
      throw new ForbiddenException({ message: '화면을 새로고침한 뒤 다시 시도해 주세요.' });
    }
    return { roomId, kind, tokenHash: hashSessionToken(token) };
  }

  async authorize(identity: ChatIdentity, database: Prisma.TransactionClient = this.prisma) {
    let memberId: string | undefined;
    let userId: string | undefined;
    if (identity.kind === 'MEMBER') {
      userId = await this.memberUser(identity.tokenHash, database);
    } else {
      const session = await database.guestSession.findUnique({ where: { tokenHash: identity.tokenHash }, select: { memberId: true, roomId: true, expiresAt: true } });
      if (!session || session.roomId !== identity.roomId || session.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException({ message: '이 방의 참여 정보가 없거나 만료되었습니다. 새 초대를 요청해 주세요.' });
      }
      memberId = session.memberId;
    }
    const member = await database.roomMember.findFirst({ where: {
      roomId: identity.roomId, kind: identity.kind, leftAt: null,
      ...(userId ? { userId } : { id: memberId! }),
    }, select: { id: true, displayName: true, kind: true, role: true, lastReadSeq: true } });
    if (!member) throw new NotFoundException({ message: '방이 없거나 현재 참여 권한이 없습니다.' });
    return { ...member, lastReadSeq: Number(member.lastReadSeq) };
  }

  async memberUser(tokenHash: string, database: Prisma.TransactionClient = this.prisma) {
    const session = await database.memberSession.findUnique({ where: { tokenHash }, select: { userId: true, expiresAt: true } });
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException({ message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    return session.userId;
  }
}
