import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_CONTRACT } from './api-contract.js';
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SIGE-H API')
    .setDescription(
      'Sistema Integral de Gestión de Enfermería Hospitalaria - API REST',
    )
    .setVersion(API_CONTRACT.version)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
