import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
}).superRefine((value, context) => {
  const configured = [value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET, value.GOOGLE_REDIRECT_URI];
  if (configured.some(Boolean) && !configured.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: '구글 설정 세 가지를 함께 지정하세요.' });
  }
  if (value.GOOGLE_REDIRECT_URI) {
    const uri = new URL(value.GOOGLE_REDIRECT_URI);
    if (!value.WEB_ORIGINS.includes(uri.origin) || uri.pathname !== '/api/v1/auth/google/callback' || uri.search || uri.hash ||
      uri.username || uri.password || (uri.protocol !== 'https:' && !(value.NODE_ENV !== 'production' &&
        uri.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(uri.hostname)))) {
      context.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: '허용된 웹 주소의 구글 콜백을 지정하세요.' });
    }
  }
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
