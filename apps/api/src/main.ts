import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './config/http-app.js';
export { configureApp } from './config/http-app.js';
export { createOpenApiDocument } from './config/openapi-document.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<number>('PORT', 3000));

  const host = configService.get<string>('HOST', '127.0.0.1');
  await app.listen(port, host);
  logger.log(`Servidor escuchando en http://${host}:${port}/api/v1`);
  logger.log(`Documentación OpenAPI disponible en http://${host}:${port}/docs`);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/main.ts') ||
    process.argv[1].endsWith('/main.js') ||
    process.argv[1].endsWith('\\main.ts') ||
    process.argv[1].endsWith('\\main.js'));

if (isDirectExecution) {
  void bootstrap();
}
