import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import type { Environment } from '../../config/environment';

export class ChatIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly environment: Environment) { super(app); }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.environment.WEB_ORIGINS, credentials: true },
      maxHttpBufferSize: 64 * 1024,
    });
  }
}
