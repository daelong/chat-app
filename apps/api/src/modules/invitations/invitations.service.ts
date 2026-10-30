import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AcceptInvitationInput, Invitation, User } from '@chat/contracts';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import type { Invitation as StoredInvitation } from '../../generated/prisma/client';
import { hashSessionToken, newSessionToken } from '../auth/session';
import { GUEST_SESSION_LIFETIME_MS, readGuestToken, writeGuestCookie } from '../guests/guest-session';
import { GuestsService } from '../guests/guests.service';
import { InvitationMailer } from './invitation-mailer';
import { InvitationsRepository } from './invitations.repository';

export const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
export function invitationStatus(invitation: Pick<StoredInvitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>): Invitation['status'] {
  return invitation.acceptedAt ? 'ACCEPTED' : invitation.revokedAt ? 'REVOKED' : invitation.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING';
}
function view(invitation: StoredInvitation): Invitation {
  return { id: invitation.id, email: invitation.email, status: invitationStatus(invitation),
    createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString(),
    deliveryStatus: invitation.deliveryStatus, deliveryMode: invitation.deliveryMode,
    deliveryError: invitation.deliveryError, sentAt: invitation.sentAt?.toISOString() ?? null };
}

@Injectable()
export class InvitationsService {
  constructor(private readonly repository: InvitationsRepository, private readonly mailer: InvitationMailer,
    private readonly guests: GuestsService, @Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  private async ownerRoom(roomId: string, userId: string) {
    const room = await this.repository.ownerRoom(roomId, userId);
    if (!room) throw new NotFoundException({ message: '방이 없거나 초대 권한이 없습니다.' });
    return room;
  }

  async list(roomId: string, userId: string) {
    await this.ownerRoom(roomId, userId);
    return (await this.repository.list(roomId)).map(view);
  }

  async create(roomId: string, user: User, email: string) {
    const room = await this.ownerRoom(roomId, user.id);
    const token = newSessionToken();
    const invitation = await this.repository.create({ roomId, inviterId: user.id, email, tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS), deliveryMode: this.mailer.mode() });
    return this.deliver(invitation, token, room.name, user.displayName);
  }

  async resend(roomId: string, id: string, user: User) {
    const room = await this.ownerRoom(roomId, user.id);
    const token = newSessionToken();
    const invitation = await this.repository.resend(roomId, id, hashSessionToken(token), new Date(Date.now() + INVITATION_LIFETIME_MS), this.mailer.mode());
    return this.deliver(invitation, token, room.name, user.displayName);
  }

  private async deliver(invitation: StoredInvitation, token: string, roomName: string | null, inviterName: string) {
    // fragment 토큰은 웹 서버 요청 URL이나 Referer에 전달되지 않습니다.
    const invitationUrl = new URL('/invite#token=' + token, this.environment.INVITE_WEB_ORIGIN).toString();
    let error: string | null = null;
    try { await this.mailer.send({ to: invitation.email, roomName, inviterName, invitationUrl, expiresAt: invitation.expiresAt }); }
    catch { error = invitation.deliveryMode === 'DISABLED' ? '메일 발송 설정이 필요합니다. 관리자에게 문의해 주세요.' : '메일 서버가 발송을 확인하지 못했습니다. 설정을 확인하고 재전송해 주세요.'; }
    return { invitation: view(await this.repository.finishDelivery(invitation.id, invitation.deliveryAttemptId, error)), invitationUrl };
  }

  async revoke(roomId: string, id: string, userId: string) {
    await this.ownerRoom(roomId, userId);
    return view(await this.repository.revoke(roomId, id));
  }

  async preview(token: string, request: Request) {
    const invitation = await this.repository.byToken(hashSessionToken(token));
    if (!invitation) throw new NotFoundException({ message: '유효한 초대 링크를 확인해 주세요.' });
    const previous = await this.guests.find(invitation.roomId, readGuestToken(request, invitation.roomId, this.environment));
    const status = !invitation.acceptedAt && !invitation.revokedAt &&
      !invitation.room.members.some((member) => member.userId === invitation.inviterId) ? 'REVOKED' as const : invitationStatus(invitation);
    return { roomName: invitation.room.name, inviterName: invitation.inviter.displayName, expiresAt: invitation.expiresAt.toISOString(),
      status, canResume: !!previous && previous.memberId === invitation.acceptedMemberId };
  }

  async accept(input: AcceptInvitationInput, request: Request, response: Response) {
    const tokenHash = hashSessionToken(input.token);
    const invitation = await this.repository.byToken(tokenHash);
    if (!invitation) throw new NotFoundException({ message: '유효한 초대 링크를 확인해 주세요.' });
    const previous = readGuestToken(request, invitation.roomId, this.environment);
    const token = newSessionToken();
    const accepted = await this.repository.accept(tokenHash, input.displayName,
      { tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + GUEST_SESSION_LIFETIME_MS) }, previous ? hashSessionToken(previous) : undefined);
    const activeToken = accepted.resumed ? previous! : token;
    writeGuestCookie(response, accepted.roomId, activeToken, accepted.expiresAt, this.environment);
    return this.guests.authenticate(accepted.roomId, activeToken);
  }
}
