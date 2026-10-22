import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

const publicUser = { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true } as const;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  createAccount(input: { email: string; displayName: string; passwordHash: string }, tokenHash: string, expiresAt: Date) {
    return this.prisma.user.create({
      data: { ...input, sessions: { create: { tokenHash, expiresAt } } }, select: publicUser,
    });
  }

  findAccount(email: string) { return this.prisma.user.findUnique({ where: { email } }); }

  createSession(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.memberSession.create({ data: { userId, tokenHash, expiresAt } });
  }

  findSession(tokenHash: string) {
    return this.prisma.memberSession.findUnique({
      where: { tokenHash }, include: { user: { select: publicUser } },
    });
  }

  revokeSession(tokenHash: string) {
    return this.prisma.memberSession.deleteMany({ where: { tokenHash } });
  }

  createGoogleAttempt(tokenHash: string, codeVerifier: string, expiresAt: Date) {
    return this.prisma.$transaction([
      this.prisma.googleLoginAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
      this.prisma.googleLoginAttempt.create({ data: { tokenHash, codeVerifier, expiresAt } }),
    ]);
  }

  consumeGoogleAttempt(tokenHash: string) {
    return this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.googleLoginAttempt.findUnique({ where: { tokenHash } });
      if (!attempt || attempt.expiresAt.getTime() <= Date.now()) return null;
      const consumed = await transaction.googleLoginAttempt.deleteMany({ where: { tokenHash, expiresAt: { gt: new Date() } } });
      return consumed.count === 1 ? attempt.codeVerifier : null;
    });
  }

  createGoogleSession(identity: { googleId: string; displayName: string }, tokenHash: string, expiresAt: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { googleId: identity.googleId }, create: identity, update: {}, select: publicUser,
      });
      await transaction.memberSession.create({ data: { userId: user.id, tokenHash, expiresAt } });
      return user;
    });
  }
}
