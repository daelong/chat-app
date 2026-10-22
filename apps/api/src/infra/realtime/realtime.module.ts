import { Module } from '@nestjs/common';
import { HealthModule } from '../../modules/health/health.module';
import { SystemGateway } from './system.gateway';

@Module({ imports: [HealthModule], providers: [SystemGateway] })
export class RealtimeModule {}
