import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(50),
}).strict();
export const loginSchema = signUpSchema.pick({ email: true, password: true });
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
