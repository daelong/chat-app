import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { API_ROUTES, CHAT_NAMESPACE, guestSessionSchema, invitationResultSchema, memberSessionSchema, messagePageSchema, messageSchema,
  roomSchema, roomListSchema, participantListSchema, messageSearchPageSchema, MAX_ATTACHMENT_SIZE,
  type ReadUpdate, type Ack, type ChatParticipant, type GuestSession, type MemberSession, type Message } from '@chat/contracts';
import { AppModule } from '../../src/app.module';
import { APP_ENVIRONMENT, environmentSchema } from '../../src/config/environment';
import { configureApp } from '../../src/configure-app';
import { hashSessionToken } from '../../src/modules/auth/session';
import { guestCookieName } from '../../src/modules/guests/guest-session';
import { InvitationMailer } from '../../src/modules/invitations/invitation-mailer';
import { ObjectStorage } from '../../src/modules/attachments/object-storage';
import { CredentialRateGuard } from '../../src/modules/auth/auth.guards';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL을 지정하세요.');
const schema = 'chat_test_' + randomUUID().replaceAll('-', '');
const database = new URL(databaseUrl); database.searchParams.set('schema', schema);
const client = new Client({ connectionString: databaseUrl });
const webOrigin = 'http://localhost:3000';
const environment = environmentSchema.parse({ NODE_ENV: 'test', DATABASE_URL: database.toString(), WEB_ORIGINS: webOrigin });
type MemberAuth = { kind: 'MEMBER'; cookie: string; session: MemberSession };
type GuestAuth = { kind: 'GUEST'; cookie: string; session: GuestSession };
type Auth = MemberAuth | GuestAuth;
let app: INestApplication | undefined;
let base: string;
let schemaCreated = false;
let owner: MemberAuth, outsider: MemberAuth;
const sockets = new Set<Socket>();
const password = 'Chat-test123!';
const objects = new Map<string, Buffer>();
let storageFailure = false;
let beforePut: (() => Promise<void>) | undefined;

before(async () => {
  await client.connect();
  await client.query('CREATE SCHEMA "' + schema + '"'); schemaCreated = true;
  await client.query('SET search_path TO "' + schema + '"');
  for (const entry of (await readdir('prisma/migrations', { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await client.query(await readFile('prisma/migrations/' + entry.name + '/migration.sql', 'utf8'));
  }
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(APP_ENVIRONMENT).useValue(environment)
    .overrideGuard(CredentialRateGuard).useValue({ canActivate: () => true })
    .overrideProvider(InvitationMailer).useValue({ mode: () => 'LOCAL', send: async () => {} })
    .overrideProvider(ObjectStorage).useValue({
      put: async (key: string, bytes: Buffer) => { if (storageFailure) throw new ServiceUnavailableException(); await beforePut?.(); objects.set(key, bytes); },
      get: async (key: string) => { const value = objects.get(key); assert.ok(value); return value; },
      remove: async (key: string) => { objects.delete(key); },
    }).compile();
  app = module.createNestApplication({ logger: false }); configureApp(app);
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  owner = await account('방장'); outsider = await account('다른 회원');
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  await app?.close();
  if (schemaCreated) { await client.query('ROLLBACK'); await client.query('DROP SCHEMA "' + schema + '" CASCADE'); }
  await client.end();
});

async function request(path: string, method = 'GET', body?: unknown, auth?: Auth, headers: Record<string, string> = {}) {
  return fetch(base + path, { method, headers: { Origin: webOrigin, 'Content-Type': 'application/json',
    ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.session.csrfToken } : {}), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function account(displayName: string): Promise<MemberAuth> {
  const response = await request(API_ROUTES.signUp, 'POST', { email: randomUUID() + '@example.com', password, displayName });
  assert.equal(response.status, 201);
  return { kind: 'MEMBER', cookie: response.headers.getSetCookie()[0]!.split(';')[0]!, session: memberSessionSchema.parse(await response.json()) };
}
async function room() {
  const response = await request(API_ROUTES.rooms, 'POST', { name: '메시지 테스트' }, owner);
  assert.equal(response.status, 201); return roomSchema.parse(await response.json()).id;
}
async function guest(roomId: string): Promise<GuestAuth> {
  const created = await request(API_ROUTES.invitations(roomId), 'POST', { email: randomUUID() + '@example.com' }, owner);
  assert.equal(created.status, 201);
  const invitation = invitationResultSchema.parse(await created.json());
  const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get('token');
  const response = await request(API_ROUTES.acceptInvitation, 'POST', { token, displayName: '손님' });
  assert.equal(response.status, 200);
  return { kind: 'GUEST', cookie: response.headers.getSetCookie()[0]!.split(';')[0]!, session: guestSessionSchema.parse(await response.json()) };
}
const path = (roomId: string, auth: Auth) => auth.kind === 'MEMBER' ? API_ROUTES.messages(roomId) : API_ROUTES.guestMessages(roomId);
async function send(roomId: string, auth: Auth, body: string, clientMessageId = randomUUID()) {
  const response = await request(path(roomId, auth), 'POST', { roomId, body, clientMessageId }, auth);
  assert.equal(response.status, 200, await response.clone().text()); return messageSchema.parse(await response.json());
}
async function list(roomId: string, auth: Auth, query = '') {
  const response = await request(path(roomId, auth) + query, 'GET', undefined, auth);
  assert.equal(response.status, 200, await response.clone().text()); return messagePageSchema.parse(await response.json());
}
async function connect(socket: Socket) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); }); socket.connect();
  });
}
async function socketFor(roomId: string, auth: Auth, options: { origin?: string; csrf?: string; cookie?: string } = {}) {
  const socket = io(base + CHAT_NAMESPACE, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
    extraHeaders: { Origin: options.origin ?? webOrigin, Cookie: options.cookie ?? auth.cookie },
    auth: { roomId, kind: auth.kind, csrfToken: options.csrf ?? auth.session.csrfToken } });
  sockets.add(socket); await connect(socket); return socket;
}
async function join(socket: Socket, roomId: string) {
  const result = await socket.timeout(3000).emitWithAck('room:join', { roomId }) as Ack<ChatParticipant>;
  assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('Join failed'); return result.data;
}
function event<T>(socket: Socket, name: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Missing socket event: ' + name)), 5000);
    socket.once(name, (value: T) => { clearTimeout(timeout); resolve(value); });
  });
}

test('회원과 게스트는 같은 방의 메시지를 저장·조회하고 서버가 작성자를 결정한다', async () => {
  const id = await room();
  const first = await send(id, owner, '  안녕하세요  ');
  const visitor = await guest(id);
  const second = await send(id, visitor, '반갑습니다\n두 번째 줄');
  assert.equal(first.body, '안녕하세요'); assert.equal(first.senderDisplayName, '방장'); assert.equal(first.senderKind, 'MEMBER');
  assert.equal(second.senderMemberId, visitor.session.participant.id); assert.equal(second.senderKind, 'GUEST');
  assert.deepEqual((await list(id, owner)).items.map((item) => item.seq), [1, 2]);
  assert.deepEqual((await list(id, visitor)).items.map((item) => item.messageId), [first.messageId, second.messageId]);
  const stored = await client.query('SELECT last_seq FROM chat_rooms WHERE id = $1', [id]); assert.equal(stored.rows[0].last_seq, '2');
  const fresh = await list(id, owner); assert.equal(fresh.items.length, 2); assert.equal(fresh.participant.id, first.senderMemberId);
});

test('이전·이후 순번 페이지를 안정된 순서로 조회하고 100개가 넘는 누락분도 이어서 읽는다', async () => {
  const id = await room(); const visitor = await guest(id);
  const participant = (await list(id, owner)).participant;
  await client.query("INSERT INTO messages (id, room_id, sender_member_id, client_message_id, seq, body) SELECT gen_random_uuid(), $1, $2, gen_random_uuid(), n, '이전 대화 ' || n FROM generate_series(1, 235) AS n", [id, participant.id]);
  await client.query('UPDATE chat_rooms SET last_seq = 235 WHERE id = $1', [id]);
  const latest = await list(id, visitor); assert.equal(latest.items[0]?.seq, 206); assert.equal(latest.items.at(-1)?.seq, 235); assert.equal(latest.hasMore, true);
  const older = await list(id, owner, '?beforeSeq=206&limit=30'); assert.equal(older.items[0]?.seq, 176); assert.equal(older.items.at(-1)?.seq, 205);
  let cursor = 0; const sequence: number[] = [];
  while (true) {
    const page = await list(id, visitor, '?afterSeq=' + cursor + '&limit=100'); sequence.push(...page.items.map((item) => item.seq));
    if (!page.hasMore) { assert.equal(page.lastSeq, 235); break; } cursor = page.items.at(-1)!.seq;
  }
  assert.deepEqual(sequence, Array.from({ length: 235 }, (_, index) => index + 1));
  assert.equal((await request(path(id, owner) + '?beforeSeq=2&afterSeq=1', 'GET', undefined, owner)).status, 400);
  assert.equal((await request(path(id, owner) + '?limit=101', 'GET', undefined, owner)).status, 400);
});

test('동시 전송과 같은 ID 재시도는 순번·메시지를 중복 생성하지 않는다', async () => {
  const id = await room();
  const messages = await Promise.all(Array.from({ length: 12 }, (_, index) => send(id, owner, '동시 메시지 ' + index)));
  assert.deepEqual(messages.map((item) => item.seq).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1));
  const clientId = randomUUID();
  const repeats = await Promise.all([send(id, owner, '한 번만 저장', clientId), send(id, owner, '한 번만 저장', clientId), send(id, owner, '한 번만 저장', clientId)]);
  assert.equal(new Set(repeats.map((item) => item.messageId)).size, 1); assert.equal(repeats[0]?.seq, 13);
  const conflict = await request(path(id, owner), 'POST', { roomId: id, clientMessageId: clientId, body: '다른 내용' }, owner); assert.equal(conflict.status, 409);
  const visitor = await guest(id); const guestMessage = await send(id, visitor, '다른 작성자의 같은 ID', clientId);
  assert.equal(guestMessage.seq, 14); assert.notEqual(guestMessage.messageId, repeats[0]?.messageId);
  assert.equal((await list(id, owner)).lastSeq, 14);
});

test('HTTP는 미인증·다른 방·잘못된 CSRF·출처·작성자 위조를 거부한다', async () => {
  const id = await room(), otherId = await room(); const visitor = await guest(id);
  const input = { roomId: id, clientMessageId: randomUUID(), body: '권한 확인' };
  assert.equal((await request(API_ROUTES.messages(id))).status, 401);
  assert.equal((await request(API_ROUTES.messages(id), 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', input, owner, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', input, owner, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', { ...input, senderMemberId: visitor.session.participant.id }, owner)).status, 400);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', { ...input, roomId: otherId }, owner)).status, 403);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', { ...input, body: ' ' }, owner)).status, 400);
  assert.equal((await request(API_ROUTES.messages(id), 'POST', { ...input, body: 'a'.repeat(4001) }, owner)).status, 400);
  assert.equal((await request(API_ROUTES.guestMessages(otherId), 'GET', undefined, visitor)).status, 401);
  const forgedCookie = guestCookieName(otherId, environment) + '=' + visitor.cookie.split('=')[1];
  assert.equal((await request(API_ROUTES.guestMessages(otherId), 'GET', undefined, visitor, { Cookie: forgedCookie })).status, 401);
  assert.equal((await request(API_ROUTES.messages(id), 'GET', undefined, visitor)).status, 401);
  assert.equal((await request(API_ROUTES.guestMessages(id), 'GET', undefined, owner)).status, 401);
  assert.equal((await list(id, owner)).items.length, 0);
});

test('실시간 양방향 전송은 저장 후 ack·이벤트를 반환하고 다른 방에 유출하지 않는다', async () => {
  const id = await room(), otherId = await room(); const visitor = await guest(id);
  const memberSocket = await socketFor(id, owner), guestSocket = await socketFor(id, visitor), otherSocket = await socketFor(otherId, owner);
  await join(memberSocket, id); await join(guestSocket, id); await join(otherSocket, otherId);
  const leaked: Message[] = []; otherSocket.on('message:new', (message) => leaked.push(message));
  const incoming = event<Message>(guestSocket, 'message:new');
  const input = { roomId: id, clientMessageId: randomUUID(), body: '회원 실시간' };
  const ack = await memberSocket.timeout(3000).emitWithAck('message:send', input) as Ack<Message>; assert.equal(ack.ok, true);
  const received = messageSchema.parse(await incoming);
  assert.equal((await client.query('SELECT body FROM messages WHERE id = $1', [received.messageId])).rows[0].body, '회원 실시간');
  const reply = event<Message>(memberSocket, 'message:new'); await send(id, visitor, '게스트 HTTP 전송도 실시간');
  assert.equal((await reply).senderKind, 'GUEST'); assert.equal(leaked.length, 0);
  const forbidden = await guestSocket.timeout(3000).emitWithAck('message:send', { ...input, roomId: otherId }) as Ack<Message>;
  assert.equal(forbidden.ok, false); if (!forbidden.ok) assert.equal(forbidden.error.status, 403);
  memberSocket.disconnect(); guestSocket.disconnect(); otherSocket.disconnect();
});

test('소켓은 출처·CSRF·참여 방·세션을 검사하며 구독 전 전송을 거부한다', async () => {
  const id = await room();
  for (const options of [{ origin: 'https://evil.example' }, { origin: '' }, { csrf: 'a'.repeat(64) }, { cookie: 'chat_member=' + 'a'.repeat(64) }]) {
    const socket = await socketFor(id, owner, options);
    const ack = await socket.timeout(3000).emitWithAck('room:join', { roomId: id }) as Ack<ChatParticipant>;
    assert.equal(ack.ok, false); socket.disconnect();
  }
  const socket = await socketFor(id, outsider);
  const joinAck = await socket.timeout(3000).emitWithAck('room:join', { roomId: id }) as Ack<ChatParticipant>; assert.equal(joinAck.ok, false);
  const sendAck = await socket.timeout(3000).emitWithAck('message:send', { roomId: id, clientMessageId: randomUUID(), body: '금지' }) as Ack<Message>;
  assert.equal(sendAck.ok, false); socket.disconnect();
});

test('연결이 끊긴 동안의 메시지는 재연결 후 afterSeq 조회로 중복 없이 복구한다', async () => {
  const id = await room(); const visitor = await guest(id); const socket = await socketFor(id, visitor);
  await join(socket, id); const first = await send(id, owner, '연결 전');
  socket.disconnect(); await send(id, owner, '연결 중단 중 1'); await send(id, owner, '연결 중단 중 2');
  await connect(socket); await join(socket, id);
  const page = await list(id, visitor, '?afterSeq=' + first.seq);
  assert.deepEqual(page.items.map((item) => item.body), ['연결 중단 중 1', '연결 중단 중 2']);
  const live = event<Message>(socket, 'message:new'); await send(id, owner, '다시 연결됨'); assert.equal((await live).seq, 4);
  socket.disconnect();
});

test('ack 유실 후 같은 메시지를 HTTP로 재전송해도 저장과 방송은 한 번만 한다', async () => {
  const id = await room(); const socket = await socketFor(id, owner); await join(socket, id);
  const events: Message[] = []; socket.on('message:new', (message) => events.push(message));
  const received = event<Message>(socket, 'message:new'); const clientId = randomUUID();
  socket.emit('message:send', { roomId: id, clientMessageId: clientId, body: '응답을 놓친 메시지' }, () => {});
  const original = await received;
  const repeated = await send(id, owner, '응답을 놓친 메시지', clientId);
  assert.equal(repeated.messageId, original.messageId); assert.equal(events.length, 1); assert.equal((await list(id, owner)).lastSeq, 1);
  socket.disconnect();
});

test('퇴장한 게스트는 기존 소켓으로 새 메시지를 받거나 전송·조회할 수 없다', async () => {
  const id = await room(); const visitor = await guest(id); const socket = await socketFor(id, visitor); await join(socket, id);
  const received: Message[] = []; socket.on('message:new', (message) => received.push(message));
  const revoked = event(socket, 'chat:access-revoked');
  await client.query('UPDATE room_members SET left_at = CURRENT_TIMESTAMP WHERE id = $1', [visitor.session.participant.id]);
  await send(id, owner, '퇴장 후 비공개'); await revoked; assert.equal(received.length, 0);
  assert.equal((await request(path(id, visitor), 'GET', undefined, visitor)).status, 404);
  const ack = await socket.timeout(3000).emitWithAck('message:send', { roomId: id, clientMessageId: randomUUID(), body: '금지' }) as Ack<Message>;
  assert.equal(ack.ok, false); socket.disconnect();
});

test('회원 로그아웃·세션 만료와 게스트 만료는 연결된 소켓 수신도 차단한다', async () => {
  const id = await room(); const visitor = await guest(id); const guestSocket = await socketFor(id, visitor); await join(guestSocket, id);
  const guestRevoked = event(guestSocket, 'chat:access-revoked');
  await client.query("UPDATE guest_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE member_id = $1", [visitor.session.participant.id]);
  await send(id, owner, '만료 후 비공개'); await guestRevoked;
  assert.equal((await request(path(id, visitor), 'GET', undefined, visitor)).status, 401); guestSocket.disconnect();
  for (const mode of ['logout', 'expire']) {
    const login = await request(API_ROUTES.login, 'POST', { email: owner.session.user.email, password });
    const auth: MemberAuth = { kind: 'MEMBER', cookie: login.headers.getSetCookie()[0]!.split(';')[0]!, session: memberSessionSchema.parse(await login.json()) };
    const socket = await socketFor(id, auth); await join(socket, id); const revoked = event(socket, 'chat:access-revoked');
    if (mode === 'logout') assert.equal((await request(API_ROUTES.logout, 'POST', {}, auth)).status, 200);
    else await client.query("UPDATE member_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token_hash = $1", [hashSessionToken(auth.cookie.split('=')[1]!)]);
    await send(id, owner, '별도 회원 세션의 접근 차단'); await revoked;
    assert.equal((await request(path(id, auth), 'GET', undefined, auth)).status, 401); socket.disconnect();
  }
});

test('방 구독 해제 후에는 실시간 메시지를 받지 않으며 다시 구독할 수 있다', async () => {
  const id = await room(); const socket = await socketFor(id, owner); await join(socket, id);
  const events: Message[] = []; socket.on('message:new', (message) => events.push(message));
  const left = await socket.timeout(3000).emitWithAck('room:leave', { roomId: id }) as Ack<void>; assert.equal(left.ok, true);
  await send(id, owner, '구독 해제 중'); assert.equal(events.length, 0);
  await join(socket, id); const received = event<Message>(socket, 'message:new'); await send(id, owner, '재구독'); assert.equal((await received).seq, 2);
  socket.disconnect();
});

test('안전한 숫자 범위를 넘는 메시지 순번은 저장을 롤백한다', async () => {
  const id = await room();
  await client.query('UPDATE chat_rooms SET last_seq = $2 WHERE id = $1', [id, String(Number.MAX_SAFE_INTEGER)]);
  const response = await request(path(id, owner), 'POST', { roomId: id, clientMessageId: randomUUID(), body: '범위 초과' }, owner);
  assert.equal(response.status, 409);
  assert.equal((await client.query('SELECT count(*) FROM messages WHERE room_id = $1', [id])).rows[0].count, '0');
  assert.equal((await client.query('SELECT last_seq FROM chat_rooms WHERE id = $1', [id])).rows[0].last_seq, String(Number.MAX_SAFE_INTEGER));
});

test('참여자 목록은 회원·게스트·방장을 구분하고 방장만 다른 참여자를 내보낸다', async () => {
  const id = await room(), other = await room(); const visitor = await guest(id), otherGuest = await guest(other);
  const participants = participantListSchema.parse(await (await request(API_ROUTES.participants(id, 'GUEST'), 'GET', undefined, visitor)).json());
  assert.equal(participants.items.length, 2); assert.equal(participants.me.kind, 'GUEST');
  assert.ok(participants.items.some((item) => item.role === 'OWNER' && item.kind === 'MEMBER'));
  assert.ok(!JSON.stringify(participants).includes('email')); assert.ok(!JSON.stringify(participants).includes('userId'));
  const memberId = randomUUID();
  await client.query("INSERT INTO room_members (id, room_id, user_id, kind, display_name, role) VALUES ($1, $2, $3, 'MEMBER', '일반 회원', 'MEMBER')", [memberId, id, outsider.session.user.id]);
  const remove = API_ROUTES.removeParticipant(id, visitor.session.participant.id);
  assert.equal((await request(remove, 'POST', {}, outsider)).status, 403);
  assert.equal((await request(remove, 'POST', {}, visitor)).status, 401);
  assert.equal((await request(remove, 'POST', {}, owner, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request(remove, 'POST', {}, owner, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(API_ROUTES.removeParticipant(id, otherGuest.session.participant.id), 'POST', {}, owner)).status, 404);
  assert.equal((await request(API_ROUTES.removeParticipant(id, participants.items.find((item) => item.role === 'OWNER')!.id), 'POST', {}, owner)).status, 403);
  assert.equal((await request(API_ROUTES.leaveRoom(id, 'MEMBER'), 'POST', {}, owner)).status, 409);
  const socket = await socketFor(id, visitor); await join(socket, id); const revoked = event(socket, 'chat:access-revoked');
  assert.equal((await request(remove, 'POST', {}, owner)).status, 200); await revoked;
  assert.equal((await request(path(id, visitor), 'GET', undefined, visitor)).status, 401);
  assert.equal((await client.query('SELECT count(*) FROM guest_sessions WHERE member_id = $1', [visitor.session.participant.id])).rows[0].count, '0');
  assert.equal((await request(API_ROUTES.leaveRoom(id, 'MEMBER'), 'POST', {}, outsider)).status, 200);
  assert.equal((await request(API_ROUTES.room(id), 'GET', undefined, outsider)).status, 404);
  socket.disconnect();
});

test('게스트가 나가도 메시지는 보존되고 방장이 혼자 나가면 미사용 초대도 취소된다', async () => {
  const id = await room(); const visitor = await guest(id); const message = await send(id, visitor, '나가기 전 기록');
  const pending = invitationResultSchema.parse(await (await request(API_ROUTES.invitations(id), 'POST', { email: randomUUID() + '@example.com' }, owner)).json());
  const left = await request(API_ROUTES.leaveRoom(id, 'GUEST'), 'POST', {}, visitor);
  assert.equal(left.status, 200); assert.ok(left.headers.getSetCookie()[0]?.includes('Expires=Thu, 01 Jan 1970'));
  assert.equal((await list(id, owner)).items[0]?.messageId, message.messageId);
  assert.equal((await request(API_ROUTES.participants(id, 'GUEST'), 'GET', undefined, visitor)).status, 401);
  assert.equal((await request(API_ROUTES.leaveRoom(id, 'MEMBER'), 'POST', {}, owner)).status, 200);
  assert.equal((await request(API_ROUTES.room(id), 'GET', undefined, owner)).status, 404);
  const token = new URLSearchParams(new URL(pending.invitationUrl).hash.slice(1)).get('token');
  assert.equal((await request(API_ROUTES.acceptInvitation, 'POST', { token, displayName: '다시 입장' })).status, 410);
});

test('읽음 위치는 동시·역순 요청에도 감소하지 않고 실제 방의 순번까지만 허용한다', async () => {
  const id = await room(); const visitor = await guest(id);
  for (let n = 1; n <= 6; n++) await send(id, owner, '읽음 메시지 ' + n);
  const socket = await socketFor(id, owner); await join(socket, id);
  const updated = event<ReadUpdate>(socket, 'message:read-updated');
  const read = (seq: number, auth: Auth = visitor) => request(path(id, auth) + '/read', 'POST', { roomId: id, lastReadSeq: seq }, auth);
  assert.equal((await read(3)).status, 200);
  assert.deepEqual(await updated, { roomId: id, memberId: visitor.session.participant.id, lastReadSeq: 3 });
  await Promise.all([read(6), read(2), read(5)]);
  assert.equal((await list(id, visitor)).participant.lastReadSeq, 6);
  assert.equal((await read(7)).status, 400);
  assert.equal((await read(-1)).status, 400);
  assert.equal((await read(2, outsider)).status, 404);
  assert.equal((await request(path(id, visitor) + '/read', 'POST', { roomId: randomUUID(), lastReadSeq: 1 }, visitor)).status, 403);
  assert.equal((await request(path(id, visitor) + '/read', 'POST', { roomId: id, lastReadSeq: 1 }, visitor, { 'X-CSRF-Token': '' })).status, 403);
  const ws = await socket.timeout(3000).emitWithAck('message:read', { roomId: id, lastReadSeq: 6 }) as Ack<void>;
  assert.equal(ws.ok, true); assert.equal((await list(id, owner)).participant.lastReadSeq, 6);
  socket.disconnect();
});

test('대화 목록은 마지막 메시지·안 읽은 개수를 계산하고 열지 않은 방도 실시간 갱신한다', async () => {
  const id = await room(); const visitor = await guest(id); const other = await room();
  const socket = await socketFor(id, owner);
  const subscribed = await socket.timeout(3000).emitWithAck('rooms:subscribe', { csrfToken: owner.session.csrfToken }) as Ack<void>; assert.equal(subscribed.ok, true);
  const changed = event<{ roomId: string }>(socket, 'room:updated');
  const message = await send(id, visitor, '목록에 보이는 새 메시지'); assert.equal((await changed).roomId, id);
  await send(id, owner, '내 메시지는 안 읽은 개수에서 제외');
  const rooms = roomListSchema.parse(await (await request(API_ROUTES.rooms, 'GET', undefined, owner)).json());
  const item = rooms.find((item) => item.id === id)!;
  assert.equal(item.unreadCount, 1); assert.equal(item.lastMessage?.seq, 2); assert.equal(rooms[0]?.id, id);
  assert.ok(rooms.some((item) => item.id === other));
  assert.equal((await request(API_ROUTES.messages(id) + '/read', 'POST', { roomId: id, lastReadSeq: message.seq }, owner)).status, 200);
  const detail = roomSchema.parse(await (await request(API_ROUTES.room(id), 'GET', undefined, owner)).json()); assert.equal(detail.unreadCount, 0);
  const otherSocket = await socketFor(id, outsider);
  assert.equal((await otherSocket.timeout(3000).emitWithAck('rooms:subscribe', { csrfToken: outsider.session.csrfToken })).ok, true);
  const leaked: unknown[] = []; otherSocket.on('room:updated', (value) => leaked.push(value));
  await send(id, visitor, '다른 회원에게 유출하지 않음'); assert.equal(leaked.length, 0);
  const badSocket = await socketFor(id, owner, { origin: 'https://evil.example' });
  assert.equal((await badSocket.timeout(3000).emitWithAck('rooms:subscribe', { csrfToken: owner.session.csrfToken })).ok, false);
  socket.disconnect(); otherSocket.disconnect(); badSocket.disconnect();
});

test('검색은 같은 방의 한글·대소문자·특수문자를 찾고 페이지와 주변 대화를 제공한다', async () => {
  const id = await room(); const visitor = await guest(id);
  const member = (await list(id, owner)).participant.id;
  await client.query("INSERT INTO messages (id, room_id, sender_member_id, client_message_id, seq, body) SELECT gen_random_uuid(), $1, $2, gen_random_uuid(), n, '검색 Hello ' || n FROM generate_series(1, 45) n", [id, member]);
  await client.query('UPDATE chat_rooms SET last_seq = 45 WHERE id = $1', [id]);
  await send(id, owner, '문자 %_\\ 포함');
  const search = (q: string, query = '') => path(id, visitor) + '/search?q=' + encodeURIComponent(q) + query;
  const first = messageSearchPageSchema.parse(await (await request(search('hello'), 'GET', undefined, visitor)).json());
  assert.equal(first.items.length, 20); assert.equal(first.hasMore, true); assert.equal(first.items[0]?.seq, 45);
  const second = messageSearchPageSchema.parse(await (await request(search('검색', '&beforeSeq=26'), 'GET', undefined, visitor)).json());
  assert.equal(second.items[0]?.seq, 25); assert.ok(second.items.every((item) => !first.items.some((old) => old.messageId === item.messageId)));
  const literal = messageSearchPageSchema.parse(await (await request(search('%_\\'), 'GET', undefined, visitor)).json()); assert.equal(literal.items.length, 1);
  assert.equal((await request(search(' ', '&limit=51'), 'GET', undefined, visitor)).status, 400);
  assert.equal((await request(API_ROUTES.messages(id) + '/search?q=hello', 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(API_ROUTES.guestMessages(await room()) + '/search?q=hello', 'GET', undefined, visitor)).status, 401);
  const around = await list(id, visitor, '?aroundSeq=20&limit=10'); assert.deepEqual(around.items.map((item) => item.seq), [16,17,18,19,20,21,22,23,24,25]);
  assert.equal((await request(path(id, visitor) + '?aroundSeq=20&afterSeq=1', 'GET', undefined, visitor)).status, 400);
});

async function upload(roomId: string, auth: Auth, name: string, bytes: Uint8Array, type = 'text/plain', id = randomUUID(), headers: Record<string, string> = {}) {
  const body = new FormData(); body.set('clientMessageId', id); body.set('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return fetch(base + API_ROUTES.files(roomId, auth.kind), { method: 'POST', body,
    headers: { Origin: webOrigin, Cookie: auth.cookie, 'X-CSRF-Token': auth.session.csrfToken, ...headers } });
}

test('파일 전송은 메시지와 함께 저장하고 재시도는 한 번만 저장하며 참여자만 다운로드한다', async () => {
  const id = await room(), other = await room(); const visitor = await guest(id); const clientId = randomUUID();
  const response = await upload(id, owner, '회의 안내.txt', Buffer.from('파일 내용'), 'text/plain', clientId);
  assert.equal(response.status, 200, await response.clone().text());
  const message = messageSchema.parse(await response.json()); const attachment = message.attachments[0]!;
  assert.equal(attachment.filename, '회의 안내.txt'); assert.equal(message.seq, 1); assert.ok(!JSON.stringify(message).includes('objectKey'));
  const count = objects.size;
  const retry = await upload(id, owner, '회의 안내.txt', Buffer.from('파일 내용'), 'text/plain', clientId);
  assert.equal(retry.status, 200); assert.equal(messageSchema.parse(await retry.json()).messageId, message.messageId); assert.equal(objects.size, count);
  const guestPath = API_ROUTES.files(id, 'GUEST') + '/' + attachment.id;
  const file = await request(guestPath, 'GET', undefined, visitor); assert.equal(file.status, 200); assert.equal(await file.text(), '파일 내용');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff'); assert.match(file.headers.get('content-disposition')!, /^attachment;/);
  assert.equal((await request(API_ROUTES.files(id, 'MEMBER') + '/' + attachment.id, 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(API_ROUTES.files(other, 'GUEST') + '/' + attachment.id, 'GET', undefined, visitor)).status, 401);
  assert.equal((await request(guestPath)).status, 401);
  assert.equal((await upload(id, owner, '회의 안내.txt', Buffer.from('다른 내용'), 'text/plain', clientId)).status, 409); assert.equal(objects.size, count);
  assert.equal((await list(id, visitor)).items[0]?.attachments[0]?.id, attachment.id);
  await request(API_ROUTES.removeParticipant(id, visitor.session.participant.id), 'POST', {}, owner);
  assert.equal((await request(guestPath, 'GET', undefined, visitor)).status, 401);
});

test('이미지 미리보기는 형식을 검증하고 실제 전송 내용을 실시간으로 제공한다', async () => {
  const id = await room(); const visitor = await guest(id); const socket = await socketFor(id, owner); await join(socket, id);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMWQAAAAASUVORK5CYII=', 'base64');
  const incoming = event<Message>(socket, 'message:new');
  const uploaded = await upload(id, visitor, '사진.png', bytes, 'image/png'); assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const message = messageSchema.parse(await incoming); const file = message.attachments[0]!;
  const preview = await request(API_ROUTES.files(id, 'MEMBER') + '/' + file.id + '?preview=1', 'GET', undefined, owner);
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/png'); assert.match(preview.headers.get('content-disposition')!, /^inline;/);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes); socket.disconnect();
});

test('파일은 크기·형식·인증·CSRF·출처를 검사하고 실패 시 메시지와 파일을 남기지 않는다', async () => {
  const id = await room(); const visitor = await guest(id); const count = objects.size;
  assert.equal((await upload(id, owner, 'fake.png', Buffer.from('<script>'), 'image/png')).status, 400);
  assert.equal((await upload(id, owner, 'empty.txt', Buffer.alloc(0))).status, 400);
  assert.equal((await upload(id, owner, 'too-large.txt', Buffer.alloc(MAX_ATTACHMENT_SIZE + 1, 65))).status, 413);
  assert.equal((await upload(id, owner, 'ok.txt', Buffer.from('hello'), 'text/plain', randomUUID(), { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await upload(id, owner, 'ok.txt', Buffer.from('hello'), 'text/plain', randomUUID(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await upload(id, outsider, 'ok.txt', Buffer.from('hello'))).status, 404);
  assert.equal((await upload(await room(), visitor, 'ok.txt', Buffer.from('hello'))).status, 401);
  const clientId = randomUUID(); storageFailure = true;
  try { assert.equal((await upload(id, owner, 'ok.txt', Buffer.from('hello'), 'text/plain', clientId)).status, 503); }
  finally { storageFailure = false; }
  assert.equal(objects.size, count); assert.equal((await list(id, owner)).lastSeq, 0);
  assert.equal((await upload(id, owner, 'ok.txt', Buffer.from('hello'), 'text/plain', clientId)).status, 200);
});

test('업로드 중 참여 권한이 취소되면 파일을 정리하고 메시지를 저장하지 않는다', async () => {
  const id = await room(); const visitor = await guest(id); const count = objects.size;
  beforePut = async () => { await client.query('UPDATE room_members SET left_at = CURRENT_TIMESTAMP WHERE id = $1', [visitor.session.participant.id]); };
  try { assert.equal((await upload(id, visitor, '취소.txt', Buffer.from('저장 금지'))).status, 404); }
  finally { beforePut = undefined; }
  assert.equal(objects.size, count); assert.equal((await list(id, owner)).lastSeq, 0);
});
