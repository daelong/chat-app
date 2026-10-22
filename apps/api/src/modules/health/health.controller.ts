import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check() { return this.health.check(); }

  @Get('ready')
  async readiness(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.readiness();
    response.status(result.status === 'UP' ? 200 : 503);
    return result;
  }
}
