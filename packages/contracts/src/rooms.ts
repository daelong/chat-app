import { z } from 'zod';

export const roomTypeSchema = z.enum(['DIRECT', 'GROUP']);
// Invite-first rooms start with their owner. Other participants join later.
export const createRoomSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const roomSchema = z.object({
  id: z.uuid(), type: roomTypeSchema, name: z.string().nullable(),
  createdAt: z.iso.datetime(),
  memberCount: z.number().int().positive(),
  myRole: z.enum(['OWNER', 'MEMBER']),
});
export const roomListSchema = z.array(roomSchema);
export const roomSubscriptionSchema = z.object({ roomId: z.uuid() }).strict();
export type Room = z.infer<typeof roomSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomSubscription = z.infer<typeof roomSubscriptionSchema>;
