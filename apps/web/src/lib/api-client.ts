import type { ZodType } from 'zod';

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', signal: signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`API 요청 실패 (${response.status})`);
  return schema.parse(await response.json());
}
