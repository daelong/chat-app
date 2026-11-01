import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from './rooms.repository';
import { MessagesModule } from '../messages/messages.module';
import { ParticipantsService } from './participants.service';
import { GuestParticipantsController, MemberParticipantsController } from './participants.controller';

@Module({ imports: [AuthModule, MessagesModule], controllers: [RoomsController, MemberParticipantsController, GuestParticipantsController], providers: [RoomsService, RoomsRepository, ParticipantsService] })
export class RoomsModule {}
