import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  DATABASE_URL: z.string().url(),
});

export type Environment = z.infer<typeof environmentSchema>;
export const APP_ENVIRONMENT = Symbol('APP_ENVIRONMENT');

export function loadEnvironment(): Environment {
  const input = { ...process.env };
  if (!input.DATABASE_URL && input.NODE_ENV !== 'production') {
    input.DATABASE_URL = 'postgresql://chat:chat_local_password@localhost:5432/chat?schema=public';
  }
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // 환경변수 값에 포함된 비밀번호·토큰은 오류 메시지에 노출하지 않습니다.
    throw new Error(`환경변수를 확인하세요: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
