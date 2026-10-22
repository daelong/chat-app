import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function parseResponse<T>(response: Response, schema: ZodType<T>): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
    throw new ApiError(response.status, typeof body?.error?.message === 'string'
      ? body.error.message : `요청을 처리하지 못했습니다. (${response.status})`);
  }
  return schema.parse(await response.json());
}

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', signal: signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
  return parseResponse(response, schema);
}

export async function apiPost<T>(path: string, body: unknown, schema: ZodType<T>, csrfToken?: string): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    body: JSON.stringify(body),
  });
  return parseResponse(response, schema);
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
