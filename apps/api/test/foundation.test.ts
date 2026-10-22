import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io } from 'socket.io-client';
import { API_ROUTES, CHAT_NAMESPACE, messagePageQuerySchema, sendMessageSchema, type Ack, type Health } from '@chat/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/infra/database/prisma.service';
import { APP_ENVIRONMENT, environmentSchema } from '../src/config/environment';

let app: INestApplication;
let origin: string;
let databaseReady = true;

before(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENVIRONMENT).useValue(environmentSchema.parse({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost/test' }))
    .overrideProvider(PrismaService).useValue({ isReady: async () => databaseReady }).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});
after(async () => { await app?.close(); });

test('API 응답은 공통 health 계약을 따른다', async () => {
  const response = await fetch(`${origin}${API_ROUTES.health}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'UP', service: 'chat-api' });
});
test('DB 연결 상태와 API 생존 상태를 구분한다', async () => {
  databaseReady = false;
  try {
    const response = await fetch(`${origin}${API_ROUTES.readiness}`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'DOWN', database: 'DOWN' });
    assert.equal((await fetch(`${origin}${API_ROUTES.health}`)).status, 200);
  } finally { databaseReady = true; }
});
test('인증 요청은 허용된 Origin 없이 처리되지 않는다', async () => {
  const response = await fetch(`${origin}${API_ROUTES.login}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'not-a-real-password' }),
  });
  assert.equal(response.status, 403);
});
test('구글 앱 설정이 없으면 기능을 비활성화한다', async () => {
  assert.deepEqual(await (await fetch(`${origin}${API_ROUTES.authProviders}`)).json(), { google: false });
  const response = await fetch(`${origin}${API_ROUTES.googleStart}`, { method: 'POST', headers: { Origin: 'http://localhost:3000' } });
  assert.equal(response.status, 503);
});
test('Socket.IO 연결과 입력 검증이 실제 네트워크에서 동작한다', async () => {
  const socket = io(`${origin}${CHAT_NAMESPACE}`, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
      socket.connect();
    });
    const good = await socket.timeout(2000).emitWithAck('system:ping', {}) as Ack<Health>;
    assert.deepEqual(good, { ok: true, data: { status: 'UP', service: 'chat-api' } });
    const invalid = await socket.timeout(2000).emitWithAck('system:ping', { extra: true }) as Ack<Health>;
    assert.equal(invalid.ok, false);
  } finally { socket.disconnect(); }
});
test('공유 계약이 빈 메시지와 상충하는 페이지 커서를 거부한다', () => {
  assert.equal(sendMessageSchema.safeParse({
    roomId: 'd9428888-122b-4e1e-b85c-61cd3cbb3210',
    clientMessageId: 'd9428888-122b-4e1e-b85c-61cd3cbb3211', body: '   ',
  }).success, false);
  assert.equal(messagePageQuerySchema.safeParse({ beforeSeq: '10', afterSeq: '5' }).success, false);
  assert.deepEqual(messagePageQuerySchema.parse({ afterSeq: '10', limit: '20' }), { afterSeq: 10, limit: 20 });
});
