import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { API_ROUTES, memberSessionSchema, roomListSchema, roomSchema, type MemberSession } from '@chat/contracts';
import { AppModule } from '../../src/app.module';
import { APP_ENVIRONMENT, environmentSchema } from '../../src/config/environment';
import { configureApp } from '../../src/configure-app';
import { hashPassword } from '../../src/modules/auth/password';
import { cookieName, hashSessionToken, newSessionToken } from '../../src/modules/auth/session';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL을 지정하세요. 테스트는 해당 DB에 임시 스키마를 만들어 사용합니다.');
const schema = 'chat_test_' + randomUUID().replaceAll('-', '');
const client = new Client({ connectionString: databaseUrl });
const testUrl = new URL(databaseUrl);
testUrl.searchParams.set('schema', schema);
const webOrigin = 'http://localhost:3000';
const environment = environmentSchema.parse({ NODE_ENV: 'test', DATABASE_URL: testUrl.toString(), WEB_ORIGINS: webOrigin });
const legacyOwner = randomUUID();
const legacyFormerMember = randomUUID();
const legacyRoom = randomUUID();
const legacyMessage = randomUUID();
const password = 'Chat-test123!';
const legacyPassword = 'test-member-password-2026';
let app: INestApplication | undefined;
let base: string;
let schemaCreated = false;

before(async () => {
  await client.connect();
  await client.query('CREATE SCHEMA "' + schema + '"');
  schemaCreated = true;
  await client.query('SET search_path TO "' + schema + '"');
  await client.query(await readFile('prisma/migrations/20261022000000_initial/migration.sql', 'utf8'));
  const hash = await hashPassword(legacyPassword);
  await client.query('INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4), ($5, $6, $3, $7)',
    [legacyOwner, 'legacy-owner@example.com', hash, '기존 회원', legacyFormerMember, 'legacy-former@example.com', '퇴장한 회원']);
  await client.query("INSERT INTO chat_rooms (id, type, name, last_seq) VALUES ($1, 'GROUP', '기존 방', 1)", [legacyRoom]);
  await client.query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'OWNER')", [legacyRoom, legacyOwner]);
  await client.query('INSERT INTO messages (id, room_id, sender_id, client_message_id, seq, body) VALUES ($1, $2, $3, $4, 1, $5)',
    [legacyMessage, legacyRoom, legacyFormerMember, randomUUID(), '보존할 메시지']);
  await client.query(await readFile('prisma/migrations/20261022010000_member_auth_and_participants/migration.sql', 'utf8'));
  await client.query(await readFile('prisma/migrations/20261022020000_kakao_login/migration.sql', 'utf8'));
  await client.query(await readFile('prisma/migrations/20261022030000_google_login/migration.sql', 'utf8'));
  await client.query(await readFile('prisma/migrations/20261027000000_invitations_and_guest_sessions/migration.sql', 'utf8'));
  await client.query(await readFile('prisma/migrations/20261101000000_chat_features/migration.sql', 'utf8'));
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENVIRONMENT).useValue(environment).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => {
  await app?.close();
  if (schemaCreated) {
    await client.query('ROLLBACK');
    await client.query('DROP SCHEMA "' + schema + '" CASCADE');
  }
  await client.end();
});

type BrowserSession = { cookie: string; session: MemberSession };
async function request(path: string, method = 'GET', body?: unknown, auth?: BrowserSession, headers: Record<string, string> = {}) {
  return fetch(base + path, { method, headers: {
    Origin: webOrigin, 'Content-Type': 'application/json',
    ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.session.csrfToken } : {}), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function account(email = randomUUID() + '@example.com'): Promise<BrowserSession> {
  const response = await request(API_ROUTES.signUp, 'POST', { email, password, displayName: '새 회원' });
  assert.equal(response.status, 201, await response.clone().text());
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { cookie: setCookie.split(';')[0]!, session: memberSessionSchema.parse(await response.json()) };
}
async function login(email: string | null, credential = password): Promise<BrowserSession> {
  assert.ok(email);
  const response = await request(API_ROUTES.login, 'POST', { email, password: credential });
  assert.equal(response.status, 200, await response.clone().text());
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, session: memberSessionSchema.parse(await response.json()) };
}
async function room(auth: BrowserSession, name = '새 채팅방') {
  const response = await request(API_ROUTES.rooms, 'POST', { name }, auth);
  assert.equal(response.status, 201, await response.clone().text());
  return roomSchema.parse(await response.json());
}

test('마이그레이션은 기존 메시지를 보존하고 퇴장한 작성자의 권한을 복구하지 않는다', async () => {
  const result = await client.query('SELECT m.body, p.user_id, p.left_at FROM messages m JOIN room_members p ON m.sender_member_id = p.id AND m.room_id = p.room_id WHERE m.id = $1', [legacyMessage]);
  assert.equal(result.rows[0].body, '보존할 메시지');
  assert.equal(result.rows[0].user_id, legacyFormerMember);
  assert.ok(result.rows[0].left_at);
  const former = await login('legacy-former@example.com', legacyPassword);
  assert.deepEqual(await (await request(API_ROUTES.rooms, 'GET', undefined, former)).json(), []);
  assert.equal((await request(API_ROUTES.room(legacyRoom), 'GET', undefined, former)).status, 404);
});

test('가입은 이메일을 정규화하고 중복 가입과 잘못된 입력을 거부한다', async () => {
  const email = randomUUID() + '@example.com';
  const member = await account('  ' + email.toUpperCase() + '  ');
  assert.equal(member.session.user.email, email);
  const stored = await client.query('SELECT password_hash FROM users WHERE id = $1', [member.session.user.id]);
  assert.match(stored.rows[0].password_hash, /^scrypt\$/);
  assert.notEqual(stored.rows[0].password_hash, password);
  assert.equal((await request(API_ROUTES.signUp, 'POST', { email, password, displayName: '중복' })).status, 409);
  assert.equal((await request(API_ROUTES.signUp, 'POST', { email: 'bad', password: 'short', displayName: ' ' })).status, 400);
  const token = member.cookie.split('=')[1]!;
  const session = await client.query('SELECT token_hash FROM member_sessions WHERE user_id = $1', [member.session.user.id]);
  assert.equal(session.rows[0].token_hash, hashSessionToken(token));
  assert.notEqual(session.rows[0].token_hash, token);
  const me = await request(API_ROUTES.me, 'GET', undefined, member);
  assert.equal(me.status, 200);
  assert.equal(memberSessionSchema.parse(await me.json()).user.id, member.session.user.id);
});

test('가입 API는 8자와 15자를 허용하고 7자와 16자를 거부한다', async () => {
  for (const length of [7, 8, 15, 16]) {
    const response = await request(API_ROUTES.signUp, 'POST', {
      email: randomUUID() + '@example.com', password: 'a'.repeat(length), displayName: '길이 확인',
    });
    assert.equal(response.status, length >= 8 && length <= 15 ? 201 : 400);
  }
});

test('잘못된 비밀번호는 로그인할 수 없고 로그아웃하면 세션 재사용도 거부된다', async () => {
  const member = await account();
  const wrong = await request(API_ROUTES.login, 'POST', { email: member.session.user.email, password: 'wrong-password' });
  assert.equal(wrong.status, 401);
  const signedIn = await login(member.session.user.email);
  assert.equal((await request(API_ROUTES.logout, 'POST', {}, signedIn)).status, 200);
  assert.equal((await request(API_ROUTES.me, 'GET', undefined, signedIn)).status, 401);
});

test('같은 브라우저에서 다시 로그인하면 이전 세션을 폐기한다', async () => {
  const previous = await account();
  const response = await request(API_ROUTES.login, 'POST', { email: previous.session.user.email, password }, previous);
  assert.equal(response.status, 200);
  const current = { cookie: response.headers.get('set-cookie')!.split(';')[0]!,
    session: memberSessionSchema.parse(await response.json()) };
  assert.notEqual(current.cookie, previous.cookie);
  assert.equal((await request(API_ROUTES.me, 'GET', undefined, previous)).status, 401);
  assert.equal((await request(API_ROUTES.me, 'GET', undefined, current)).status, 200);
});

test('회원이 만든 방은 DB에 소유자와 함께 저장되며 본인의 목록과 상세에 나타난다', async () => {
  const member = await account();
  const created = await room(member, '  주말 모임  ');
  assert.equal(created.name, '주말 모임');
  assert.equal(created.memberCount, 1);
  assert.equal(created.myRole, 'OWNER');
  const list = roomListSchema.parse(await (await request(API_ROUTES.rooms, 'GET', undefined, member)).json());
  assert.equal(list[0]?.id, created.id);
  const renewed = await login(member.session.user.email);
  const detail = roomSchema.parse(await (await request(API_ROUTES.room(created.id), 'GET', undefined, renewed)).json());
  assert.equal(detail.id, created.id);
  const members = await client.query('SELECT user_id, kind, role FROM room_members WHERE room_id = $1', [created.id]);
  assert.deepEqual(members.rows, [{ user_id: member.session.user.id, kind: 'MEMBER', role: 'OWNER' }]);
});

test('미인증·위조·만료 세션과 다른 방 접근은 거부된다', async () => {
  const owner = await account();
  const outsider = await account();
  const created = await room(owner);
  assert.equal((await request(API_ROUTES.rooms)).status, 401);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '익명 방' })).status, 401);
  assert.equal((await request(API_ROUTES.room(created.id), 'GET', undefined, outsider)).status, 404);
  assert.deepEqual(await (await request(API_ROUTES.rooms, 'GET', undefined, outsider)).json(), []);
  assert.equal((await request(API_ROUTES.rooms, 'GET', undefined, owner, { Cookie: cookieName(environment) + '=' + newSessionToken() })).status, 401);
  await client.query('UPDATE member_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE user_id = $1', [owner.session.user.id]);
  assert.equal((await request(API_ROUTES.me, 'GET', undefined, owner)).status, 401);
});

test('다른 출처·누락된 CSRF·다른 세션의 CSRF와 임의 참여자 입력은 거부된다', async () => {
  const member = await account();
  const other = await account();
  assert.equal((await request(API_ROUTES.login, 'POST', { email: member.session.user.email, password }, undefined, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '방' }, member, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '방' }, member, { 'X-CSRF-Token': other.session.csrfToken })).status, 403);
  assert.equal((await request(API_ROUTES.logout, 'POST', {}, member, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '방', participantIds: [other.session.user.id] }, member)).status, 400);
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: ' ' }, member)).status, 400);
});

test('게스트 참여자는 계정 없이 저장할 수 있고 다른 방의 메시지 작성자가 될 수 없다', async () => {
  const owner = await account();
  const first = await room(owner);
  const second = await room(owner);
  const guestId = randomUUID();
  await client.query("INSERT INTO room_members (id, room_id, kind, display_name) VALUES ($1, $2, 'GUEST', '초대 게스트')", [guestId, first.id]);
  await client.query('INSERT INTO messages (id, room_id, sender_member_id, client_message_id, seq, body) VALUES ($1, $2, $3, $4, 1, $5)',
    [randomUUID(), first.id, guestId, randomUUID(), '게스트 작성']);
  await assert.rejects(client.query('INSERT INTO messages (id, room_id, sender_member_id, client_message_id, seq, body) VALUES ($1, $2, $3, $4, 1, $5)',
    [randomUUID(), second.id, guestId, randomUUID(), '다른 방 접근']), (error: unknown) => (error as { code?: string }).code === '23503');
  await assert.rejects(client.query("INSERT INTO room_members (id, room_id, kind, display_name, role) VALUES ($1, $2, 'GUEST', '권한 위조', 'OWNER')",
    [randomUUID(), first.id]), (error: unknown) => (error as { code?: string }).code === '23514');
  const guestCookie = 'chat_guest=' + newSessionToken();
  assert.equal((await request(API_ROUTES.rooms, 'POST', { name: '게스트 방' }, undefined, { Cookie: guestCookie })).status, 401);
});
