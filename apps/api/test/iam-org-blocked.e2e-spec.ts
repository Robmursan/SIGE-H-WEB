import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { type INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { OrganizationQueries } from '../src/modules/organizacion/application/organization-queries.js';
import { configureApp } from '../src/main.js';

describe('B1 — exposición HTTP bloqueada por defecto', () => {
  let app: INestApplication;
  const query = vi.fn(() => {
    throw new Error('Acceso PG prohibido en este test HTTP');
  });
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, connect: query, end: vi.fn() })
      .overrideProvider(AppService)
      .useFactory({ factory: () => new AppService() })
      .compile();
    app = fixture.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/servicios/33333333-3333-4333-8333-333333333333/subareas',
    '/api/v1/organizacion/arbol',
    '/api/v1/roles',
  ])('GET %s no está publicado', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer unverified-input')
      .expect(404);
  });
  it.each([
    '/api/v1/hospitales',
    '/api/v1/hospitales/11111111-1111-4111-8111-111111111111/divisiones',
    '/api/v1/servicios',
  ])('ORG %s deshabilitado antes de SQL', async (path) => {
    await request(app.getHttpServer()).get(path).expect(503);
  });
  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
  ])('POST %s deshabilitado antes de SQL', async (path) => {
    await request(app.getHttpServer()).post(path).send({}).expect(503);
  });
  it('el grafo Nest registra casos internos, pero niega identidad sin consultar PostgreSQL', async () => {
    await expect(
      app.get(OrganizationQueries).list(undefined, 'hospitales', {}),
    ).rejects.toThrow('IDENTIDAD_NO_DISPONIBLE');
  });
  it('Swagger incluye rutas reales IAM deshabilitadas por defecto', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);
    expect(Object.keys(body.paths).sort()).toEqual([
      '/api/v1',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/sessions',
      '/api/v1/auth/sessions/{sessionId}',
      '/api/v1/contratos/{contratoId}/adscripciones',
      '/api/v1/empleados',
      '/api/v1/empleados/{empleadoId}',
      '/api/v1/health',
      '/api/v1/health/live',
      '/api/v1/health/ready',
      '/api/v1/hospitales',
      '/api/v1/hospitales/{hospitalId}/divisiones',
      '/api/v1/meta/version',
      '/api/v1/pases-lista',
      '/api/v1/programaciones',
      '/api/v1/programaciones/{programacionId}/asistencia',
      '/api/v1/servicios',
      '/api/v1/tableros/coordinacion',
    ]);
    expect(body.paths['/api/v1/meta/version'].get.operationId).toBe(
      'getApiContractVersion',
    );
  });
});
