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
  INVITE_WEB_ORIGIN: z.url().optional(),
  MAIL_MODE: z.enum(['local', 'smtp', 'disabled']).default('disabled'),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional().transform((value) => value || undefined),
  SMTP_PASSWORD: z.string().optional().transform((value) => value || undefined),
  MAIL_FROM: z.email().default('chat@localhost.test'),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default('chat-attachments'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (!!value.S3_ACCESS_KEY !== !!value.S3_SECRET_KEY) context.addIssue({ code: 'custom', path: ['S3_ACCESS_KEY'], message: '저장소 인증 정보를 함께 지정하세요.' });
  const inviteOrigin = URL.parse(value.INVITE_WEB_ORIGIN ?? value.WEB_ORIGINS[0]!);
  if (!inviteOrigin || !value.WEB_ORIGINS.includes(inviteOrigin.origin) || inviteOrigin.href !== inviteOrigin.origin + '/' ||
    (value.MAIL_MODE !== 'disabled' && inviteOrigin.protocol !== 'https:' && !(value.NODE_ENV !== 'production' && inviteOrigin.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(inviteOrigin.hostname)))) {
    context.addIssue({ code: 'custom', path: ['INVITE_WEB_ORIGIN'], message: '허용된 웹의 초대 주소를 지정하세요.' });
  }
  if (!!value.SMTP_USER !== !!value.SMTP_PASSWORD) {
    context.addIssue({ code: 'custom', path: ['SMTP_USER'], message: 'SMTP 인증 정보를 함께 지정하세요.' });
  }
  if (value.MAIL_MODE === 'local' && (value.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', 'mailpit'].includes(value.SMTP_HOST))) {
    context.addIssue({ code: 'custom', path: ['MAIL_MODE'], message: '개발용 메일함은 로컬 환경에서만 사용하세요.' });
  }
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
}).transform((value) => ({ ...value, INVITE_WEB_ORIGIN: value.INVITE_WEB_ORIGIN ?? value.WEB_ORIGINS[0]! }));

export type Environment = z.infer<typeof environmentSchema>;
export const APP_ENVIRONMENT = Symbol('APP_ENVIRONMENT');

export function loadEnvironment(): Environment {
  const input = { ...process.env };
  if (!input.DATABASE_URL && input.NODE_ENV !== 'production') {
    input.DATABASE_URL = 'postgresql://chat:chat_local_password@localhost:5432/chat?schema=public';
  }
  if (!input.MAIL_MODE && input.NODE_ENV !== 'production') input.MAIL_MODE = 'local';
  if (!input.INVITE_WEB_ORIGIN) input.INVITE_WEB_ORIGIN = (input.WEB_ORIGINS ?? 'http://localhost:3000').split(',')[0]!.trim();
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // 환경변수 값에 포함된 비밀번호·토큰은 오류 메시지에 노출하지 않습니다.
    throw new Error(`환경변수를 확인하세요: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
