import { z } from 'zod';

export const healthSchema = z.object({
  status: z.literal('UP'),
  service: z.literal('chat-api'),
});
export const readinessSchema = z.object({
  status: z.enum(['UP', 'DOWN']),
  database: z.enum(['UP', 'DOWN']),
});
export type Health = z.infer<typeof healthSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
