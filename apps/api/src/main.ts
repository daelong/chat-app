import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const environment = configureApp(app);
  await app.listen(environment.PORT, environment.HOST);
}

void bootstrap().catch(() => {
  console.error('API를 시작하지 못했습니다. 환경변수와 사용 중인 포트를 확인하세요.');
  process.exitCode = 1;
});
