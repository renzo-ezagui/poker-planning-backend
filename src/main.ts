import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { allowedOrigins } from './common/origins';
import { expressTrustProxy, trustProxyMode } from './common/client-ip';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', expressTrustProxy(trustProxyMode()));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: allowedOrigins(), credentials: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
