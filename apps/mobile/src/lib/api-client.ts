import type { ZodType } from 'zod';
import { joinUrl } from '@chat/utils';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 5000);
  try {
    const response = await fetch(joinUrl(API_URL, path), { signal: controller.signal });
    if (!response.ok) throw new Error(`API 요청 실패 (${response.status})`);
    return schema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
