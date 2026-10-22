import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from './rooms.repository';

@Module({ imports: [AuthModule], controllers: [RoomsController], providers: [RoomsService, RoomsRepository] })
export class RoomsModule {}
