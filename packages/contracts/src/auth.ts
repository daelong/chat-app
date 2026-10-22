import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(15),
  displayName: z.string().trim().min(1).max(50),
}).strict();
export const loginSchema = signUpSchema.pick({ email: true }).extend({ password: z.string().min(1).max(128) });
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;

export const memberSessionSchema = z.object({
  user: userSchema,
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const logoutResultSchema = z.object({ ok: z.literal(true) });
export type MemberSession = z.infer<typeof memberSessionSchema>;
export const authProvidersSchema = z.object({ google: z.boolean() });
export const googleStartSchema = z.object({ authorizationUrl: z.url() });
