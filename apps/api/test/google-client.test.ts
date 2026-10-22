import 'reflect-metadata';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { environmentSchema } from '../src/config/environment';
import { GoogleClient } from '../src/modules/auth/google.client';

const configuration = {
  DATABASE_URL: 'postgresql://test:test@localhost/test', GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/google/callback',
};
const attempt = { nonce: 'test-nonce', codeVerifier: 'test-code-verifier' };
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
function idToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: configuration.GOOGLE_CLIENT_ID,
      sub: 'google-user-123', name: '  구글 회원  ', nonce: attempt.nonce, iat: now, exp: now + 3600, ...overrides })).toString('base64url')];
  const input = parts.join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url');
}
const certificates = { certs: { test: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } };

test('구글 설정은 함께 지정하며 콜백은 허용된 웹 주소와 운영 HTTPS만 사용한다', () => {
  assert.equal(environmentSchema.safeParse({ DATABASE_URL: configuration.DATABASE_URL }).success, true);
  assert.equal(environmentSchema.safeParse({ DATABASE_URL: configuration.DATABASE_URL, GOOGLE_CLIENT_ID: 'key' }).success, false);
  for (const uri of ['https://evil.example/api/v1/auth/google/callback', 'http://localhost:3000/wrong',
    'http://localhost:3000/api/v1/auth/google/callback?next=https://evil.example']) {
    assert.equal(environmentSchema.safeParse({ ...configuration, GOOGLE_REDIRECT_URI: uri }).success, false);
  }
  assert.equal(environmentSchema.safeParse({ ...configuration, NODE_ENV: 'production' }).success, false);
});

test('구글 인가 코드와 PKCE를 교환하고 서명된 ID 토큰의 sub로 회원을 식별한다', async (context) => {
  let options: RequestInit | undefined;
  context.mock.method(globalThis, 'fetch', async (url: string, input?: RequestInit) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    options = input;
    return Response.json({ id_token: idToken({ email: 'existing@example.com' }) });
  });
  context.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => certificates);
  const identity = await new GoogleClient(environmentSchema.parse(configuration)).getIdentity('test-code', attempt);
  assert.deepEqual(identity, { googleId: 'google-user-123', displayName: '구글 회원' });
  const body = options?.body as URLSearchParams;
  assert.equal(body.get('client_secret'), 'test-secret');
  assert.equal(body.get('code'), 'test-code');
  assert.equal(body.get('code_verifier'), attempt.codeVerifier);
  assert.equal(body.get('redirect_uri'), configuration.GOOGLE_REDIRECT_URI);
});

test('잘못된 서명·수신자·발급자·만료·nonce와 공급자 오류는 토큰 노출 없이 거부한다', async (context) => {
  const client = new GoogleClient(environmentSchema.parse(configuration));
  let token = idToken();
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ id_token: token }));
  context.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => certificates);
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [{ aud: 'other-client' }, { iss: 'https://evil.example' }, { iat: now - 7200, exp: now - 3600 },
    { nonce: 'other-browser' }, { sub: 123 }]) {
    token = idToken(claims);
    await assert.rejects(client.getIdentity('test-code', attempt));
  }
  const valid = idToken();
  const signature = valid.lastIndexOf('.') + 1;
  token = valid.slice(0, signature) + (valid[signature] === 'A' ? 'B' : 'A') + valid.slice(signature + 1);
  await assert.rejects(client.getIdentity('test-code', attempt));
  fetchMock.mock.mockImplementation(async () => Response.json({ error: 'test-secret' }, { status: 401 }));
  await assert.rejects(client.getIdentity('test-code', attempt), (error: unknown) => error instanceof Error &&
    error.message.includes('구글 로그인') && !error.message.includes('test-secret'));
});
