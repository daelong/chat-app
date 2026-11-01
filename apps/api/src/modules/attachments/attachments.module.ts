import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { AttachmentsService } from './attachments.service';
import { FileRoomGuard, GuestAttachmentsController, MemberAttachmentsController } from './attachments.controller';
import { ObjectStorage } from './object-storage';

@Module({ imports: [AuthModule, MessagesModule], controllers: [MemberAttachmentsController, GuestAttachmentsController],
  providers: [ObjectStorage, AttachmentsService, FileRoomGuard] })
export class AttachmentsModule {}
