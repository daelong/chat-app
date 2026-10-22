import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { loginSchema, signUpSchema } from '@chat/contracts';
import { CredentialRateGuard } from '../src/modules/auth/auth.guards';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';
import { csrfForSession, hashSessionToken, newSessionToken, validCsrf } from '../src/modules/auth/session';

test('신규 비밀번호는 8~15자이며 기존의 긴 비밀번호 로그인은 허용한다', () => {
  const fields = { email: 'member@example.com', displayName: '회원' };
  for (const length of [8, 15]) assert.equal(signUpSchema.safeParse({ ...fields, password: 'a'.repeat(length) }).success, true);
  for (const length of [7, 16]) assert.equal(signUpSchema.safeParse({ ...fields, password: 'a'.repeat(length) }).success, false);
  assert.equal(loginSchema.safeParse({ email: fields.email, password: 'existing-member-password' }).success, true);
});

test('비밀번호는 매번 다른 salt로 저장되고 잘못된 비밀번호는 거부된다', async () => {
  const first = await hashPassword('a-long-test-password');
  const second = await hashPassword('a-long-test-password');
  assert.notEqual(first, second);
  assert.equal(first.includes('a-long-test-password'), false);
  assert.equal(await verifyPassword('a-long-test-password', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('a-long-test-password', 'malformed'), false);
});

test('CSRF 검증은 다른 세션의 토큰과 잘못된 형식을 거부한다', () => {
  const token = newSessionToken();
  const csrf = csrfForSession(token);
  assert.notEqual(hashSessionToken(token), token);
  assert.equal(validCsrf(csrf, csrf), true);
  assert.equal(validCsrf(csrfForSession(newSessionToken()), csrf), false);
  assert.equal(validCsrf(undefined, csrf), false);
  assert.equal(validCsrf('invalid', csrf), false);
});

test('반복 인증 요청은 해시 연산 전에 제한된다', () => {
  const guard = new CredentialRateGuard();
  const headers: Record<string, unknown> = {};
  const context = { switchToHttp: () => ({
    getRequest: () => ({ ip: '127.0.0.1' }),
    getResponse: () => ({ setHeader: (name: string, value: unknown) => { headers[name] = value; } }),
  }) } as unknown as ExecutionContext;
  for (let index = 0; index < 30; index++) assert.equal(guard.canActivate(context), true);
  assert.throws(() => guard.canActivate(context), (error: unknown) =>
    typeof error === 'object' && error !== null && 'getStatus' in error &&
    (error as { getStatus(): number }).getStatus() === 429);
  assert.ok(Number(headers['Retry-After']) > 0);
});
