import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RealtimeModule } from './infra/realtime/realtime.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { UsersModule } from './modules/users/users.module';

@Module({ imports: [ConfigModule, DatabaseModule, HealthModule, AuthModule, UsersModule, RoomsModule, MessagesModule, RealtimeModule] })
export class AppModule {}
