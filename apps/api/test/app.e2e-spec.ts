import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PostgresService } from '../src/database/postgres.service.js';
import { configureApp } from '../src/main.js';

describe('SIGE-H Infraestructura, Health y Swagger (e2e)', () => {
  let app: INestApplication<App>;
  let postgresService: PostgresService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    postgresService = app.get<PostgresService>(PostgresService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1 retorna el mensaje base de la API', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200);

    expect(response.text).toBe('SIGE-H API Online');
  });

  it('GET /api/v1/health ejecuta SELECT 1 contra PostgreSQL y retorna 200 OK', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'sige-h-api',
      database: {
        status: 'up',
        schema: 'sigeh',
      },
    });
    expect(typeof response.body.database.latencyMs).toBe('number');
    expect(response.body.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('verifica en modo solo lectura las 51 tablas maestras del esquema sigeh mediante PostgresService', async () => {
    const result = await postgresService.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      ['sigeh'],
    );

    expect(result.rows[0]?.total).toBe(51);
  });

  it('GET /api/v1/health retorna 503 Service Unavailable sanitizado cuando falla PostgreSQL', async () => {
    const pingSpy = vi
      .spyOn(postgresService, 'ping')
      .mockRejectedValueOnce(new Error('Fallo simulado de pool PostgreSQL'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      service: 'sige-h-api',
      database: {
        status: 'down',
        schema: 'sigeh',
      },
      message: 'Base de datos PostgreSQL no disponible',
    });
    expect(JSON.stringify(response.body)).not.toContain('password');

    pingSpy.mockRestore();
  });

  it('GET /docs y GET /docs/openapi.json exponen Swagger y documentan /api/v1/health (200 y 503)', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);

    const openApiResponse = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);

    expect(openApiResponse.body.info?.title).toBe('SIGE-H API');
    const healthOperation = openApiResponse.body.paths?.['/api/v1/health']?.get;
    expect(healthOperation).toBeDefined();
    expect(healthOperation.operationId).toBe('getHealth');
    expect(healthOperation.responses).toHaveProperty('200');
    expect(healthOperation.responses).toHaveProperty('503');
  });
});
