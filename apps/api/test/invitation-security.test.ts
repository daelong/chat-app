import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptInvitationSchema, createInvitationSchema } from '@chat/contracts';
import { environmentSchema } from '../src/config/environment';
import { invitationEmail } from '../src/modules/invitations/invitation-email';
import { invitationStatus } from '../src/modules/invitations/invitations.service';

test('초대 입력은 이메일을 정규화하고 임의 방·권한·빈 이름을 받지 않는다', () => {
  assert.deepEqual(createInvitationSchema.parse({ email: '  FRIEND@EXAMPLE.COM ' }), { email: 'friend@example.com' });
  assert.equal(createInvitationSchema.safeParse({ email: 'a@example.com', roomId: 'other' }).success, false);
  assert.equal(createInvitationSchema.safeParse({ email: 'a@example.com\r\nBcc: b@example.com' }).success, false);
  for (const name of ['', ' ', 'a'.repeat(51)]) assert.equal(acceptInvitationSchema.safeParse({ token: 'a'.repeat(64), displayName: name }).success, false);
  assert.equal(acceptInvitationSchema.safeParse({ token: 'a'.repeat(64), displayName: '게스트' }).success, true);
});

test('초대 메일은 이름과 방 이름을 HTML로 실행하지 않으며 참여 버튼과 만료를 포함한다', () => {
  const email = invitationEmail({ roomName: '<img src=x onerror=alert(1)>', inviterName: '<script>evil</script>\r\nBcc: bad',
    invitationUrl: 'https://chat.example.com/invite#token=' + 'a'.repeat(64), expiresAt: new Date('2026-11-01T00:00:00Z') });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(!email.html.includes('<img'));
  assert.ok(!email.subject.includes('\r'));
  assert.ok(!email.subject.includes('\n'));
  assert.ok(email.html.includes('채팅방 참여하기'));
  assert.ok(email.html.includes('https://chat.example.com/invite#token='));
  assert.ok(email.text.includes('유효기간:'));
});

test('수락·취소 상태는 링크 만료 뒤에도 유지된다', () => {
  const expired = new Date(Date.now() - 1000);
  assert.equal(invitationStatus({ expiresAt: expired, acceptedAt: null, revokedAt: null }), 'EXPIRED');
  assert.equal(invitationStatus({ expiresAt: expired, acceptedAt: new Date(), revokedAt: null }), 'ACCEPTED');
  assert.equal(invitationStatus({ expiresAt: expired, acceptedAt: null, revokedAt: new Date() }), 'REVOKED');
});

test('실제 SMTP는 운영 HTTPS를 요구하고 개발용 메일은 로컬 호스트만 허용한다', () => {
  const basic = { DATABASE_URL: 'postgresql://test:test@localhost/test' };
  assert.equal(environmentSchema.safeParse({ ...basic, MAIL_MODE: 'local', SMTP_HOST: 'smtp.example.com' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, MAIL_MODE: 'local', NODE_ENV: 'production' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, SMTP_USER: 'user' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, INVITE_WEB_ORIGIN: 'https://evil.example.com' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, INVITE_WEB_ORIGIN: 'not-a-url' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, INVITE_WEB_ORIGIN: 'http://localhost:3000/path' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, NODE_ENV: 'production', MAIL_MODE: 'smtp' }).success, false);
  assert.equal(environmentSchema.safeParse({ ...basic, NODE_ENV: 'production', MAIL_MODE: 'smtp',
    WEB_ORIGINS: 'https://chat.example.com', INVITE_WEB_ORIGIN: 'https://chat.example.com', SMTP_HOST: 'smtp.example.com' }).success, true);
});
