import { z } from 'zod';

export const messageSequenceSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const attachmentSchema = z.object({
  id: z.uuid(), filename: z.string(), mimeType: z.string(), size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const sendMessageSchema = z.object({
  roomId: z.uuid(), clientMessageId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
}).strict();
export const messageSchema = sendMessageSchema.extend({
  messageId: z.uuid(), senderMemberId: z.uuid(),
  senderDisplayName: z.string(), senderKind: z.enum(['MEMBER', 'GUEST']),
  seq: messageSequenceSchema.positive(), createdAt: z.iso.datetime(),
  attachments: z.array(attachmentSchema).default([]),
});
export const chatParticipantSchema = z.object({ id: z.uuid(), displayName: z.string(), kind: z.enum(['MEMBER', 'GUEST']),
  role: z.enum(['OWNER', 'MEMBER']), lastReadSeq: messageSequenceSchema });
export const participantListSchema = z.object({ items: z.array(chatParticipantSchema), me: chatParticipantSchema });
export const chatSocketAuthSchema = z.object({
  roomId: z.uuid(), kind: z.enum(['MEMBER', 'GUEST']), csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const messagePageSchema = z.object({
  items: z.array(messageSchema), hasMore: z.boolean(), lastSeq: messageSequenceSchema,
  participant: chatParticipantSchema,
});
export const messagePageQuerySchema = z.object({
  beforeSeq: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  afterSeq: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  aroundSeq: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict().refine((value) => [value.beforeSeq, value.afterSeq, value.aroundSeq].filter((item) => item !== undefined).length <= 1, {
  message: 'beforeSeq, afterSeq, aroundSeq 중 하나만 사용할 수 있습니다.',
});
export const messageSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(100),
  beforeSeq: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export const messageSearchPageSchema = z.object({ items: z.array(messageSchema), hasMore: z.boolean() });
export const readMessageSchema = z.object({
  roomId: z.uuid(), lastReadSeq: messageSequenceSchema,
}).strict();
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ReadMessageInput = z.infer<typeof readMessageSchema>;
export type ReadUpdate = ReadMessageInput & { memberId: string };
export type MessageSearchQuery = z.infer<typeof messageSearchQuerySchema>;
export type MessagePageQuery = z.infer<typeof messagePageQuerySchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type ChatParticipant = z.infer<typeof chatParticipantSchema>;
export type ChatSocketAuth = z.infer<typeof chatSocketAuthSchema>;
