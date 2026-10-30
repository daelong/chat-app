import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CredentialRateGuard } from '../auth/auth.guards';
import { GuestsModule } from '../guests/guests.module';
import { InvitationMailer } from './invitation-mailer';
import { PublicInvitationsController, RoomInvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';

@Module({ imports: [AuthModule, GuestsModule], controllers: [RoomInvitationsController, PublicInvitationsController],
  providers: [InvitationsRepository, InvitationsService, InvitationMailer, CredentialRateGuard] })
export class InvitationsModule {}
