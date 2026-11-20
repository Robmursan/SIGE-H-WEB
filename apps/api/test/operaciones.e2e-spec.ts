import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { configureApp } from '../src/main.js';

describe('CU-OPS-03 — contrato HTTP sin PostgreSQL', () => {
  let app: INestApplication | undefined;
  const forbiddenDatabaseUse = vi.fn(() => {
    throw new Error('Estas pruebas HTTP no permiten acceso a PostgreSQL');
  });

  async function start(
    swaggerEnabled = 'true',
    nodeEnv = 'test',
    query: (...args: unknown[]) => unknown = forbiddenDatabaseUse,
  ) {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({
        query,
        connect: forbiddenDatabaseUse,
        end: vi.fn(),
      })
      // The actual AppService supports an absent optional startup DB probe.
      // Only that bootstrap probe is excluded; controllers/use cases are real.
      .overrideProvider(AppService)
      .useFactory({ factory: () => new AppService() })
      .compile();

    const config = fixture.get(ConfigService);
    config.set('SWAGGER_ENABLED', swaggerEnabled);
    config.set('NODE_ENV', nodeEnv);
    app = fixture.createNestApplication();
    configureApp(app);
    await app.init();
    return app.getHttpServer();
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    expect(forbiddenDatabaseUse).not.toHaveBeenCalled();
    forbiddenDatabaseUse.mockClear();
  });

  it('preserva health/readiness con solo SELECT y sin permisos IAM', async () => {
    const query = vi.fn(async () => ({
      rows: [{ ok: 1, schema_exists: true }],
      rowCount: 1,
    }));
    const server = await start('true', 'test', query);
    for (const path of ['/api/v1/health', '/api/v1/health/ready']) {
      const r = await request(server).get(path).expect(200);
      expect(r.body).toMatchObject({
        status: 'ok',
        database: { status: 'up', schema: 'sigeh', schemaVerified: true },
      });
    }
    expect(query.mock.calls).toHaveLength(2);
  });

  it('sirve versión y liveness reales sin sesión, sin secretos y sin consultar BD', async () => {
    const server = await start();
    const response = await request(server)
      .get('/api/v1/meta/version')
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store')
      .expect(200);

    expect(response.body).toEqual({
      apiVersion: '1.0.0',
      apiBasePath: '/api/v1',
    });
    await request(server).get('/api/v1/health/live').expect(200);
    await request(server).post('/api/v1/meta/version').send({}).expect(404);
  });

  it('mantiene versión, prefijo y DTO consistentes con el OpenAPI generado', async () => {
    const server = await start();
    const response = await request(server)
      .get('/api/v1/meta/version')
      .expect(200);
    await request(server).get('/docs').expect(200);
    const { body: document } = await request(server)
      .get('/docs/openapi.json')
      .expect(200);

    expect(document.info.version).toBe(response.body.apiVersion);
    expect(Object.keys(document.paths).sort()).toEqual([
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
    const operation = document.paths['/api/v1/meta/version'].get;
    expect(operation.operationId).toBe('getApiContractVersion');
    expect(
      operation.responses['200'].content['application/json'].schema,
    ).toEqual({
      $ref: '#/components/schemas/ApiVersionResponseDto',
    });
    expect(
      document.components.schemas.ApiVersionResponseDto.required.sort(),
    ).toEqual(['apiBasePath', 'apiVersion']);
    const operationIds = Object.values(document.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId: string }>).map(
        (operation) => operation.operationId,
      ),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operation.security ?? []).toEqual([]);
  });

  it.each([
    ['false', 'test'],
    ['true', 'production'],
  ])(
    'mantiene metadatos con Swagger=%s y NODE_ENV=%s',
    async (swagger, env) => {
      const server = await start(swagger, env);
      await request(server).get('/api/v1/meta/version').expect(200);
      await request(server).get('/docs').expect(404);
      await request(server).get('/docs/openapi.json').expect(404);
    },
  );

  it('atiende consultas concurrentes sin cambiar versión ni estado', async () => {
    const server = await start();
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(server).get('/api/v1/meta/version').expect(200),
      ),
    );
    expect(
      new Set(responses.map((response) => JSON.stringify(response.body))).size,
    ).toBe(1);
    expect(
      responses.every(
        (response) => response.headers['cache-control'] === 'no-store',
      ),
    ).toBe(true);
  });
});
