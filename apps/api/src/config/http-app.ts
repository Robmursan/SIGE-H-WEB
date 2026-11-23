import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { API_CONTRACT } from './api-contract.js';
import { createOpenApiDocument } from './openapi-document.js';
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_CONTRACT.globalPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.enableShutdownHooks();

  const configService = app.get(ConfigService, { strict: false });
  const swaggerEnabled =
    configService?.get<string>('SWAGGER_ENABLED', 'true') ?? 'true';
  const nodeEnv =
    configService?.get<string>('NODE_ENV', 'development') ?? 'development';

  if (swaggerEnabled === 'true' && nodeEnv !== 'production') {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
}
