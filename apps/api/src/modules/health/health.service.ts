import { Injectable } from '@nestjs/common';
import type { Health, Readiness } from '@chat/contracts';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  check(): Health { return { status: 'UP', service: 'chat-api' }; }

  async readiness(): Promise<Readiness> {
    const ready = await this.prisma.isReady();
    return { status: ready ? 'UP' : 'DOWN', database: ready ? 'UP' : 'DOWN' };
  }
}
