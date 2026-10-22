import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { API_PREFIX } from '@chat/contracts';
import { APP_ENVIRONMENT, type Environment } from './config/environment';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ChatIoAdapter } from './infra/realtime/chat-io.adapter';

export function configureApp(app: INestApplication): Environment {
  const environment = app.get<Environment>(APP_ENVIRONMENT);
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.use(helmet());
  app.enableCors({ origin: environment.WEB_ORIGINS, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new ChatIoAdapter(app, environment));
  app.enableShutdownHooks();
  return environment;
}
