import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { API_ROUTES, memberSessionSchema } from '@chat/contracts';
import { AppModule } from '../../src/app.module';
import { APP_ENVIRONMENT, environmentSchema } from '../../src/config/environment';
import { configureApp } from '../../src/configure-app';
import { GoogleClient } from '../../src/modules/auth/google.client';
import { googleCookieName } from '../../src/modules/auth/google.service';
import { cookieName, hashSessionToken, newSessionToken } from '../../src/modules/auth/session';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL을 지정하세요.');
const schema = 'chat_test_' + randomUUID().replaceAll('-', '');
const client = new Client({ connectionString: databaseUrl });
const url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
const webOrigin = 'http://localhost:3000';
const environment = environmentSchema.parse({ NODE_ENV: 'test', DATABASE_URL: url.toString(), WEB_ORIGINS: webOrigin,
  GOOGLE_CLIENT_ID: 'test-key', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: webOrigin + API_ROUTES.googleCallback });
let app: INestApplication | undefined;
let base: string;
let schemaCreated = false;
let providerCalls = 0;

before(async () => {
  await client.connect();
  await client.query('CREATE SCHEMA "' + schema + '"');
  schemaCreated = true;
  await client.query('SET search_path TO "' + schema + '"');
  for (const entry of (await readdir('prisma/migrations', { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await client.query(await readFile(`prisma/migrations/${entry.name}/migration.sql`, 'utf8'));
  }
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENVIRONMENT).useValue(environment)
    .overrideProvider(GoogleClient).useValue({ getIdentity: async (code: string) => {
      providerCalls++;
      if (code === 'provider-failure') throw new Error('provider-secret-must-not-leak');
      return { googleId: code, displayName: '구글 테스트 회원' };
    } }).compile();
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

async function start() {
  const response = await fetch(base + API_ROUTES.googleStart, { method: 'POST', headers: { Origin: webOrigin } });
  assert.equal(response.status, 200);
  const result = await response.json() as { authorizationUrl: string };
  const authorization = new URL(result.authorizationUrl);
  assert.equal(authorization.origin, 'https://accounts.google.com');
  assert.equal(authorization.pathname, '/o/oauth2/v2/auth');
  assert.equal(authorization.searchParams.get('scope'), 'openid profile');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('redirect_uri'), environment.GOOGLE_REDIRECT_URI);
  assert.equal(authorization.searchParams.get('client_secret'), null);
  const state = authorization.searchParams.get('state')!;
  assert.equal(authorization.searchParams.get('nonce'), state);
  const attempt = await client.query('SELECT code_verifier FROM google_login_attempts WHERE token_hash = $1', [hashSessionToken(state)]);
  assert.equal(authorization.searchParams.get('code_challenge'), createHash('sha256').update(attempt.rows[0].code_verifier).digest('base64url'));
  assert.match(state, /^[a-f0-9]{64}$/);
  const setCookie = response.headers.getSetCookie()[0]!;
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  assert.ok(setCookie.startsWith(googleCookieName(environment) + '=' + state));
  return { state, cookie: setCookie.split(';')[0]! };
}

async function callback(attempt: { state: string; cookie: string }, code: string, previousCookie = '') {
  return fetch(base + API_ROUTES.googleCallback + '?' + new URLSearchParams({ state: attempt.state, code }), {
    redirect: 'manual', headers: { Cookie: [attempt.cookie, previousCookie].filter(Boolean).join('; ') },
  });
}
function sessionCookie(response: Response) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(cookieName(environment) + '='));
  assert.ok(cookie);
  return cookie.split(';')[0]!;
}
async function me(cookie: string) {
  const response = await fetch(base + API_ROUTES.me, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return memberSessionSchema.parse(await response.json());
}

test('구글 시작은 Origin을 검사하고 state 원문을 DB에 저장하지 않는다', async () => {
  assert.deepEqual(await (await fetch(base + API_ROUTES.authProviders)).json(), { google: true });
  assert.equal((await fetch(base + API_ROUTES.googleStart, { method: 'POST' })).status, 403);
  assert.equal((await fetch(base + API_ROUTES.googleStart, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  const attempt = await start();
  const stored = await client.query('SELECT token_hash FROM google_login_attempts WHERE token_hash = $1', [hashSessionToken(attempt.state)]);
  assert.equal(stored.rowCount, 1);
  assert.notEqual(stored.rows[0].token_hash, attempt.state);
});

test('첫 구글 로그인은 비밀번호 없는 회원을 만들고 방 생성과 재로그인을 지원한다', async () => {
  const identity = '10001';
  const first = await callback(await start(), identity);
  assert.equal(first.headers.get('location'), webOrigin + '/chats');
  const firstCookie = sessionCookie(first);
  const session = await me(firstCookie);
  assert.equal(session.user.email, null);
  const stored = await client.query('SELECT google_id, password_hash FROM users WHERE id = $1', [session.user.id]);
  assert.deepEqual(stored.rows, [{ google_id: identity, password_hash: null }]);
  const room = await fetch(base + API_ROUTES.rooms, { method: 'POST', headers: {
    Cookie: firstCookie, Origin: webOrigin, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ name: '구글 회원의 방' }) });
  assert.equal(room.status, 201);
  const second = await callback(await start(), identity, firstCookie);
  const secondCookie = sessionCookie(second);
  assert.notEqual(secondCookie, firstCookie);
  assert.equal((await me(secondCookie)).user.id, session.user.id);
  assert.equal((await fetch(base + API_ROUTES.me, { headers: { Cookie: firstCookie } })).status, 401);
  const rooms = await (await fetch(base + API_ROUTES.rooms, { headers: { Cookie: secondCookie } })).json() as unknown[];
  assert.equal(rooms.length, 1);
  const secondSession = await me(secondCookie);
  assert.equal((await fetch(base + API_ROUTES.logout, { method: 'POST', headers: {
    Cookie: secondCookie, Origin: webOrigin, 'X-CSRF-Token': secondSession.csrfToken,
  } })).status, 200);
  assert.equal((await fetch(base + API_ROUTES.me, { headers: { Cookie: secondCookie } })).status, 401);
});

test('잘못된 브라우저 state·만료·재사용 요청은 구글 API를 호출하지 않는다', async () => {
  const attempt = await start();
  let calls = providerCalls;
  for (const invalid of [ { ...attempt, cookie: '' }, { ...attempt, state: newSessionToken() },
    { ...attempt, cookie: attempt.cookie + '; ' + attempt.cookie } ]) {
    const response = await callback(invalid, '10002');
    assert.equal(response.headers.get('location'), webOrigin + '/login?google=failed');
    assert.equal(providerCalls, calls);
  }
  await client.query('UPDATE google_login_attempts SET expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE token_hash = $1', [hashSessionToken(attempt.state)]);
  assert.equal((await callback(attempt, '10002')).headers.get('location'), webOrigin + '/login?google=failed');
  assert.equal(providerCalls, calls);
  const fresh = await start();
  assert.equal((await callback(fresh, '10002')).headers.get('location'), webOrigin + '/chats');
  calls = providerCalls;
  assert.equal((await callback(fresh, '10002')).headers.get('location'), webOrigin + '/login?google=failed');
  assert.equal(providerCalls, calls);
});

test('동의 취소·공급자 오류는 고정된 로그인 화면으로 돌아가며 세션을 발급하지 않는다', async () => {
  const attempt = await start();
  const calls = providerCalls;
  const cancelled = await fetch(base + API_ROUTES.googleCallback + '?' + new URLSearchParams({
    state: attempt.state, error: 'access_denied', error_description: 'https://evil.example',
  }), { redirect: 'manual', headers: { Cookie: attempt.cookie } });
  assert.equal(cancelled.headers.get('location'), webOrigin + '/login?google=cancelled');
  assert.equal(providerCalls, calls);
  const failure = await callback(await start(), 'provider-failure');
  assert.equal(failure.headers.get('location'), webOrigin + '/login?google=failed');
  assert.ok(!failure.headers.getSetCookie().some((value) => value.startsWith(cookieName(environment) + '=')));
  assert.ok(!(await failure.text()).includes('provider-secret'));
});

test('같은 구글 계정의 동시 로그인은 하나의 회원을 사용한다', async () => {
  const first = await start();
  const second = await start();
  const responses = await Promise.all([callback(first, '10003'), callback(second, '10003')]);
  const sessions = await Promise.all(responses.map((response) => me(sessionCookie(response))));
  assert.equal(sessions[0]?.user.id, sessions[1]?.user.id);
  assert.equal((await client.query('SELECT id FROM users WHERE google_id = $1', ['10003'])).rowCount, 1);
});
