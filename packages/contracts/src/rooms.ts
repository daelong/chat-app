import { z } from 'zod';

export const roomTypeSchema = z.enum(['DIRECT', 'GROUP']);
export const createRoomSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DIRECT'), participantId: z.uuid() }).strict(),
  z.object({
    type: z.literal('GROUP'), name: z.string().trim().min(1).max(100),
    participantIds: z.array(z.uuid()).min(1).max(100),
  }).strict(),
]);
export const roomSchema = z.object({
  id: z.uuid(), type: roomTypeSchema, name: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const roomSubscriptionSchema = z.object({ roomId: z.uuid() }).strict();
export type Room = z.infer<typeof roomSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomSubscription = z.infer<typeof roomSubscriptionSchema>;
