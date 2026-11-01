import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomAccessService } from './room-access.service';
import { MessagesRepository } from './messages.repository';
import { MessageBroadcaster } from './message-broadcaster';
import { MessagesService } from './messages.service';
import { GuestMessagesController, MemberMessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';

@Module({ imports: [AuthModule], controllers: [MemberMessagesController, GuestMessagesController],
  providers: [RoomAccessService, MessagesRepository, MessageBroadcaster, MessagesService, MessagesGateway],
  exports: [RoomAccessService, MessagesRepository, MessageBroadcaster] })
export class MessagesModule {}
