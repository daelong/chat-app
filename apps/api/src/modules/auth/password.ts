import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt option: N=2^15, r=8, p=3 (32 MiB).
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export const DUMMY_PASSWORD_HASH = ['scrypt', '32768', '8', '3', '0'.repeat(32), '0'.repeat(128)].join('$');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return ['scrypt', '32768', '8', '3', salt, (await derive(password, salt)).toString('hex')].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || extra !== undefined ||
    !salt || !/^[a-f0-9]{32}$/.test(salt) || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'));
}
