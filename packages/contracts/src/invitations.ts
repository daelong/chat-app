import { z } from 'zod';

export const invitationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const createInvitationSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)).transform((value) => value.toLowerCase()),
}).strict();
export const invitationSchema = z.object({
  id: z.uuid(), email: z.email(), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']),
  deliveryStatus: z.enum(['SENDING', 'SENT', 'FAILED']),
  deliveryMode: z.enum(['LOCAL', 'SMTP', 'DISABLED']),
  deliveryError: z.string().nullable(), sentAt: z.iso.datetime().nullable(),
});
export const invitationListSchema = z.array(invitationSchema);
export const invitationResultSchema = z.object({ invitation: invitationSchema, invitationUrl: z.url() });
export const previewInvitationInputSchema = z.object({ token: invitationTokenSchema }).strict();
export const acceptInvitationSchema = previewInvitationInputSchema.extend({ displayName: z.string().trim().min(1).max(50) });
export const invitationPreviewSchema = z.object({
  roomName: z.string().nullable(), inviterName: z.string(), expiresAt: z.iso.datetime(),
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']), canResume: z.boolean(),
});
export const guestSessionSchema = z.object({
  room: z.object({ id: z.uuid(), name: z.string().nullable(), memberCount: z.number().int().positive() }),
  participant: z.object({ id: z.uuid(), displayName: z.string(), kind: z.literal('GUEST') }),
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.iso.datetime(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type GuestSession = z.infer<typeof guestSessionSchema>;
