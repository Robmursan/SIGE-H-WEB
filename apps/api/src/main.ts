import {
  type INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');

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
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SIGE-H API')
      .setDescription(
        'Sistema Integral de Gestión de Enfermería Hospitalaria - API REST',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<number>('PORT', 3000));

  await app.listen(port);
  logger.log(`Servidor escuchando en http://localhost:${port}/api/v1`);
  logger.log(
    `Documentación OpenAPI disponible en http://localhost:${port}/docs`,
  );
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
