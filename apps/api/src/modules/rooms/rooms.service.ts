import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRoomInput, Room, User } from '@chat/contracts';
import { RoomsRepository } from './rooms.repository';

type StoredRoom = Awaited<ReturnType<RoomsRepository['create']>>;
function roomView(room: StoredRoom): Room {
  const membership = room.members[0];
  if (!membership) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: '참여할 수 있는 채팅방이 없습니다.' });
  return { id: room.id, type: room.type, name: room.name, createdAt: room.createdAt.toISOString(),
    memberCount: room._count.members, myRole: membership.role, lastReadSeq: Number(membership.lastReadSeq), unreadCount: room.unreadCount,
    lastMessage: room.messages[0] ? { body: room.messages[0].body, createdAt: room.messages[0].createdAt.toISOString(),
      seq: Number(room.messages[0].seq), senderDisplayName: room.messages[0].sender.displayName, hasAttachment: room.messages[0].attachments.length > 0 } : null };
}

@Injectable()
export class RoomsService {
  constructor(private readonly repository: RoomsRepository) {}
  async create(input: CreateRoomInput, user: User): Promise<Room> {
    return roomView(await this.repository.create(input.name, user.id, user.displayName));
  }
  async list(userId: string): Promise<Room[]> { return (await this.repository.list(userId)).map(roomView); }
  async find(id: string, userId: string): Promise<Room> {
    const room = await this.repository.findForMember(id, userId);
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: '채팅방이 없거나 참여 권한이 없습니다.' });
    return roomView(room);
  }
}
