import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { API_ROUTES, guestSessionSchema, invitationListSchema, invitationPreviewSchema, invitationResultSchema, memberSessionSchema, roomSchema, type MemberSession } from '@chat/contracts';
import { AppModule } from '../../src/app.module';
import { APP_ENVIRONMENT, environmentSchema } from '../../src/config/environment';
import { configureApp } from '../../src/configure-app';
import { hashSessionToken, newSessionToken } from '../../src/modules/auth/session';
import { guestCookieName } from '../../src/modules/guests/guest-session';
import { InvitationMailer } from '../../src/modules/invitations/invitation-mailer';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL을 지정하세요.');
const schema = 'chat_test_' + randomUUID().replaceAll('-', '');
const client = new Client({ connectionString: databaseUrl });
const url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
const webOrigin = 'http://localhost:3000';
const environment = environmentSchema.parse({ NODE_ENV: 'test', DATABASE_URL: url.toString(), WEB_ORIGINS: webOrigin, MAIL_MODE: 'local' });
let app: INestApplication | undefined;
let base: string;
let schemaCreated = false;
let failNext = false;
const mail: { to: string; invitationUrl: string; roomName: string; inviterName: string }[] = [];
type Auth = { cookie: string; session: MemberSession };
let owner: Auth;
let other: Auth;
let roomId: string;
let otherRoomId: string;

before(async () => {
  await client.connect();
  await client.query('CREATE SCHEMA "' + schema + '"');
  schemaCreated = true;
  await client.query('SET search_path TO "' + schema + '"');
  for (const entry of (await readdir('prisma/migrations', { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await client.query(await readFile(`prisma/migrations/${entry.name}/migration.sql`, 'utf8'));
  }
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(APP_ENVIRONMENT).useValue(environment)
    .overrideProvider(InvitationMailer).useValue({ mode: () => 'LOCAL', send: async (input: typeof mail[number]) => {
      if (failNext) { failNext = false; throw new Error('smtp-password-must-not-leak'); }
      mail.push(input);
    } }).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  owner = await account(); other = await account();
  roomId = await room(owner); otherRoomId = await room(other);
});
after(async () => {
  await app?.close();
  if (schemaCreated) {
    await client.query('ROLLBACK');
    await client.query('DROP SCHEMA "' + schema + '" CASCADE');
  }
  await client.end();
});

async function request(path: string, method = 'GET', body?: unknown, auth?: Auth | string, headers: Record<string, string> = {}) {
  return fetch(base + path, { method, headers: { Origin: webOrigin, 'Content-Type': 'application/json',
    ...(typeof auth === 'string' ? { Cookie: auth } : auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.session.csrfToken } : {}), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function account(): Promise<Auth> {
  const response = await request(API_ROUTES.signUp, 'POST', { email: randomUUID() + '@example.com', password: 'Test1234!', displayName: '초대한 회원' });
  assert.equal(response.status, 201);
  return { cookie: response.headers.getSetCookie()[0]!.split(';')[0]!, session: memberSessionSchema.parse(await response.json()) };
}
async function room(auth: Auth) {
  const response = await request(API_ROUTES.rooms, 'POST', { name: '초대 테스트 방' }, auth);
  assert.equal(response.status, 201);
  return roomSchema.parse(await response.json()).id;
}
async function invite(email = randomUUID() + '@example.com') {
  const response = await request(API_ROUTES.invitations(roomId), 'POST', { email }, owner);
  assert.equal(response.status, 201, await response.clone().text());
  const result = invitationResultSchema.parse(await response.json());
  const token = new URLSearchParams(new URL(result.invitationUrl).hash.slice(1)).get('token')!;
  return { ...result, token };
}
async function preview(token: string, cookie?: string) { return request(API_ROUTES.previewInvitation, 'POST', { token }, cookie); }
async function accept(token: string, cookie?: string) { return request(API_ROUTES.acceptInvitation, 'POST', { token, displayName: '초대 손님' }, cookie); }

test('방장만 초대를 발급·조회할 수 있고 회원·CSRF·Origin을 검사한다', async () => {
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'a@example.com' })).status, 401);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'GET', undefined, other)).status, 404);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'a@example.com' }, other)).status, 404);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'a@example.com' }, owner, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'a@example.com' }, owner, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'bad' }, owner)).status, 400);
  await client.query("INSERT INTO room_members (id, room_id, user_id, kind, display_name, role) VALUES ($1, $2, $3, 'MEMBER', '일반 참여자', 'MEMBER')", [randomUUID(), roomId, other.session.user.id]);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'GET', undefined, other)).status, 404);
});

test('초대는 48시간 만료와 토큰 해시를 저장하고 메일에 방·초대한 사람·링크를 전달한다', async () => {
  const created = await invite('  FRIEND@EXAMPLE.COM ');
  assert.equal(created.invitation.email, 'friend@example.com');
  assert.equal(created.invitation.deliveryStatus, 'SENT');
  assert.equal(created.invitation.deliveryMode, 'LOCAL');
  const stored = await client.query('SELECT * FROM invitations WHERE id = $1', [created.invitation.id]);
  assert.equal(stored.rows[0].token_hash, hashSessionToken(created.token));
  assert.ok(!JSON.stringify(stored.rows[0]).includes(created.token));
  assert.ok(new Date(created.invitation.expiresAt).getTime() - Date.now() > 47 * 60 * 60 * 1000);
  assert.equal(mail.at(-1)?.to, 'friend@example.com');
  assert.equal(mail.at(-1)?.roomName, '초대 테스트 방');
  assert.equal(mail.at(-1)?.inviterName, '초대한 회원');
  assert.equal(mail.at(-1)?.invitationUrl, created.invitationUrl);
  const list = invitationListSchema.parse(await (await request(API_ROUTES.invitations(roomId), 'GET', undefined, owner)).json());
  assert.ok(list.some((item) => item.id === created.invitation.id));
  assert.ok(!JSON.stringify(list).includes(created.token));
});

test('초대 미리보기와 GET 링크 조회는 초대를 소비하거나 참여자를 만들지 않는다', async () => {
  const created = await invite();
  for (let count = 0; count < 2; count++) {
    const response = await preview(created.token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = invitationPreviewSchema.parse(await response.json());
    assert.equal(data.status, 'PENDING'); assert.equal(data.canResume, false);
    assert.ok(!JSON.stringify(data).includes(created.invitation.email));
  }
  assert.equal((await request('/api/v1/invitations/accept?token=' + created.token)).status, 404);
  assert.equal((await client.query('SELECT accepted_at FROM invitations WHERE id = $1', [created.invitation.id])).rows[0].accepted_at, null);
});

test('표시 이름만으로 가입 없이 입장하고 새로고침·같은 브라우저 재수락은 같은 참여자를 복원한다', async () => {
  const created = await invite();
  const beforeUsers = Number((await client.query('SELECT count(*) FROM users')).rows[0].count);
  const response = await accept(created.token);
  assert.equal(response.status, 200, await response.clone().text());
  const session = guestSessionSchema.parse(await response.json());
  const setCookie = response.headers.getSetCookie()[0]!;
  assert.ok(setCookie.startsWith(guestCookieName(roomId, environment) + '='));
  assert.ok(setCookie.includes('HttpOnly')); assert.ok(setCookie.includes('SameSite=Lax'));
  const cookie = setCookie.split(';')[0]!;
  assert.equal(session.room.id, roomId); assert.equal(session.participant.displayName, '초대 손님');
  assert.equal(Number((await client.query('SELECT count(*) FROM users')).rows[0].count), beforeUsers);
  const rawToken = cookie.split('=')[1]!;
  const stored = await client.query('SELECT token_hash, room_id, member_id FROM guest_sessions WHERE member_id = $1', [session.participant.id]);
  assert.equal(stored.rows[0].token_hash, hashSessionToken(rawToken));
  for (let reload = 0; reload < 2; reload++) {
    const resumed = await request(API_ROUTES.guestRoom(roomId), 'GET', undefined, cookie);
    assert.equal(resumed.status, 200);
    assert.equal(guestSessionSchema.parse(await resumed.json()).participant.id, session.participant.id);
  }
  assert.equal((await preview(created.token, cookie)).status, 200);
  const repeated = await accept(created.token, cookie);
  assert.equal(repeated.status, 200);
  assert.equal(guestSessionSchema.parse(await repeated.json()).participant.id, session.participant.id);
  assert.equal((await client.query('SELECT count(*) FROM guest_sessions WHERE member_id = $1', [session.participant.id])).rows[0].count, '1');
  assert.equal((await accept(created.token)).status, 410);
  assert.equal((await request(API_ROUTES.revokeInvitation(roomId, created.invitation.id), 'POST', {}, owner)).status, 409);
});

test('게스트는 다른 방·회원 계정·방 생성·초대 관리에 접근할 수 없다', async () => {
  const response = await accept((await invite()).token);
  const cookie = response.headers.getSetCookie()[0]!.split(';')[0]!;
  assert.equal((await request(API_ROUTES.guestRoom(otherRoomId), 'GET', undefined, cookie)).status, 401);
  // 쿠키 이름을 다른 방 것으로 위조해도 DB의 room_id 검사를 통과할 수 없습니다.
  const forged = guestCookieName(otherRoomId, environment) + '=' + cookie.split('=')[1];
  assert.equal((await request(API_ROUTES.guestRoom(otherRoomId), 'GET', undefined, forged)).status, 401);
  assert.equal((await request(API_ROUTES.me, 'GET', undefined, cookie)).status, 401);
  assert.equal((await request(API_ROUTES.room(otherRoomId), 'GET', undefined, cookie)).status, 401);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '금지된 방' }, cookie)).status, 401);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'POST', { email: 'a@example.com' }, cookie)).status, 401);
  assert.equal((await request(API_ROUTES.invitations(roomId), 'GET', undefined, cookie)).status, 401);
});

test('메일 발송 실패를 저장하고 재전송할 때 이전 링크를 폐기한다', async () => {
  failNext = true;
  const created = await invite();
  assert.equal(created.invitation.deliveryStatus, 'FAILED');
  assert.ok(!JSON.stringify(created).includes('smtp-password'));
  const response = await request(API_ROUTES.resendInvitation(roomId, created.invitation.id), 'POST', {}, owner);
  assert.equal(response.status, 200, await response.clone().text());
  const resent = invitationResultSchema.parse(await response.json());
  assert.equal(resent.invitation.deliveryStatus, 'SENT');
  assert.equal(resent.invitation.deliveryError, null);
  assert.notEqual(resent.invitationUrl, created.invitationUrl);
  assert.equal((await preview(created.token)).status, 404);
  const newToken = new URLSearchParams(new URL(resent.invitationUrl).hash.slice(1)).get('token')!;
  assert.equal((await preview(newToken)).status, 200);
  assert.equal((await request(API_ROUTES.resendInvitation(roomId, created.invitation.id), 'POST', {}, owner)).status, 409);
});

test('만료·취소된 초대는 참여할 수 없고 취소 후 재전송도 거부된다', async () => {
  const expired = await invite();
  await client.query("UPDATE invitations SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [expired.invitation.id]);
  assert.equal(invitationPreviewSchema.parse(await (await preview(expired.token)).json()).status, 'EXPIRED');
  assert.equal((await accept(expired.token)).status, 410);
  const cancelled = await invite();
  const revoke = await request(API_ROUTES.revokeInvitation(roomId, cancelled.invitation.id), 'POST', {}, owner);
  assert.equal(revoke.status, 200);
  assert.equal(invitationPreviewSchema.parse(await (await preview(cancelled.token)).json()).status, 'REVOKED');
  assert.equal((await accept(cancelled.token)).status, 410);
  assert.equal((await request(API_ROUTES.resendInvitation(roomId, cancelled.invitation.id), 'POST', {}, owner)).status, 410);
  assert.equal((await request(API_ROUTES.revokeInvitation(roomId, expired.invitation.id), 'POST', {}, other)).status, 404);
});

test('동시 수락은 참여자·세션을 한 번만 생성한다', async () => {
  const created = await invite();
  const responses = await Promise.all([accept(created.token), accept(created.token)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 410]);
  const invitation = (await client.query('SELECT accepted_member_id FROM invitations WHERE id = $1', [created.invitation.id])).rows[0];
  assert.ok(invitation.accepted_member_id);
  assert.equal((await client.query('SELECT count(*) FROM guest_sessions WHERE member_id = $1', [invitation.accepted_member_id])).rows[0].count, '1');
});

test('잘못된 토큰·누락된 출처·이름·권한 위조는 참여자를 생성하지 않는다', async () => {
  const created = await invite();
  assert.equal((await preview(newSessionToken())).status, 404);
  assert.equal((await request(API_ROUTES.acceptInvitation, 'POST', { token: created.token, displayName: ' ' })).status, 400);
  assert.equal((await request(API_ROUTES.acceptInvitation, 'POST', { token: created.token, displayName: '이름', userId: owner.session.user.id })).status, 400);
  assert.equal((await request(API_ROUTES.acceptInvitation, 'POST', { token: created.token, displayName: '이름' }, undefined, { Origin: '' })).status, 403);
  assert.equal((await client.query('SELECT accepted_at FROM invitations WHERE id = $1', [created.invitation.id])).rows[0].accepted_at, null);
});

test('게스트 세션 만료와 퇴장한 참여자는 기존 쿠키로 접근할 수 없다', async () => {
  const response = await accept((await invite()).token);
  const session = guestSessionSchema.parse(await response.json());
  const cookie = response.headers.getSetCookie()[0]!.split(';')[0]!;
  await client.query("UPDATE guest_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE member_id = $1", [session.participant.id]);
  assert.equal((await request(API_ROUTES.guestRoom(roomId), 'GET', undefined, cookie)).status, 401);
  const active = await accept((await invite()).token);
  const activeSession = guestSessionSchema.parse(await active.json());
  const activeCookie = active.headers.getSetCookie()[0]!.split(';')[0]!;
  await client.query('UPDATE room_members SET left_at = CURRENT_TIMESTAMP WHERE id = $1', [activeSession.participant.id]);
  assert.equal((await request(API_ROUTES.guestRoom(roomId), 'GET', undefined, activeCookie)).status, 401);
});
