import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import {
  ReadReadinessGuard,
  READ_PERMISSIONS,
} from '../src/modules/lecturas/read.service.js';
import { ReadRepository } from '../src/modules/lecturas/read.repository.js';
import { configureApp, createOpenApiDocument } from '../src/main.js';
import { iamFixture } from './fixtures/iam-mock.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  D = '33333333-3333-4333-8333-333333333333',
  OTHER = '99999999-9999-4999-8999-999999999999';
const query = `hospitalId=${H}&servicioId=${S}&fecha=2026-11-16`;
function expectNestError(body: Record<string, unknown>, code: number) {
  expect(Object.keys(body).sort()).toEqual(['error', 'message', 'statusCode']);
  expect(body.statusCode).toBe(code);
  const labels: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    503: 'Service Unavailable',
  };
  expect(body.error).toBe(labels[code]);
  if (Array.isArray(body.message)) {
    expect(body.message.length).toBeGreaterThan(0);
    expect(
      body.message.every((value: unknown) => typeof value === 'string'),
    ).toBe(true);
  } else expect(typeof body.message).toBe('string');
}
async function setup(enabled: boolean) {
  const f = iamFixture();
  f.access.assignments.mockResolvedValue([
    {
      kind: 'TITULAR',
      mandateFrom: new Date('2026-01-01'),
      mandateUntil: null,
      encargoPermissions: [],
      usuarioActivo: true,
      hospitalActivo: true,
      scope: { hospitalId: H, divisionId: D, servicioId: S },
      division: { id: D, hospitalId: H, activo: true },
      servicio: { id: S, hospitalId: H, divisionId: D, activo: true },
      vigenteDesde: new Date('2026-01-01'),
      vigenteHasta: null,
      observedAt: new Date('2026-11-16'),
      permissions: [READ_PERMISSIONS.personal],
    },
  ] as never);
  const forbidden = vi.fn(() => {
    throw Error('Local HTTP tests forbid PG');
  });
  const repo = {
    staff: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      limit: 50,
      order: 'id:asc',
    })),
    detail: vi.fn(async () => {
      throw new NotFoundException('Empleado no disponible');
    }),
  };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
    .overrideProvider(AppService)
    .useFactory({ factory: () => new AppService() })
    .overrideProvider(IamSettings)
    .useValue(f.settings)
    .overrideProvider(IamService)
    .useValue(f.service)
    .overrideProvider(ReadRepository)
    .useValue(repo);
  if (enabled) {
    const ready = { requireEnabled: () => {}, canActivate: () => true };
    builder = builder
      .overrideGuard(ReadReadinessGuard)
      .useValue(ready)
      .overrideProvider(ReadReadinessGuard)
      .useValue(ready);
  }
  const module = await builder.compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, f, repo, forbidden };
}
describe('L3A preparado, HTTP local con tripwire (no QA)', () => {
  it('cinco rutas reales permanecen 503 por defecto incluso con IAM de prueba', async () => {
    const { app, forbidden } = await setup(false);
    try {
      for (const url of [
        '/empleados',
        '/empleados/' + H,
        '/contratos/' + H + '/adscripciones',
        '/programaciones',
        '/tableros/coordinacion',
      ])
        await request(app.getHttpServer())
          .get('/api/v1' + url)
          .expect(503)
          .expect((r) => expectNestError(r.body, 503));
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('401/400/403/404 y DTO paginado sin conceder permisos SQL', async () => {
    const { app, f, repo, forbidden } = await setup(true);
    try {
      await request(app.getHttpServer())
        .get('/api/v1/empleados?' + query)
        .expect(401)
        .expect((r) => expectNestError(r.body, 401));
      const token = await f.service.login(
        'cuenta_ficticia',
        f.password,
        'synthetic',
      );
      const header = 'Bearer ' + token.accessToken;
      await request(app.getHttpServer())
        .get('/api/v1/empleados?hospitalId=' + H)
        .set('Authorization', header)
        .expect((r) => expect(Array.isArray(r.body.message)).toBe(true))
        .expect(400)
        .expect((r) => expectNestError(r.body, 400));
      await request(app.getHttpServer())
        .get('/api/v1/empleados?' + query + '&isAdmin=true')
        .set('Authorization', header)
        .expect(400)
        .expect((r) => expectNestError(r.body, 400));
      await request(app.getHttpServer())
        .get('/api/v1/empleados?' + query.replace(H, OTHER))
        .set('Authorization', header)
        .expect(403)
        .expect((r) => expectNestError(r.body, 403));
      await request(app.getHttpServer())
        .get('/api/v1/empleados?' + query.replace(S, OTHER))
        .set('Authorization', header)
        .expect(403)
        .expect((r) => expectNestError(r.body, 403));
      for (const route of [
        '/empleados/not-a-uuid',
        '/contratos/not-a-uuid/adscripciones',
      ]) {
        await request(app.getHttpServer())
          .get('/api/v1' + route + '?' + query)
          .set('Authorization', header)
          .expect(400)
          .expect((r) => {
            expectNestError(r.body, 400);
            expect(typeof r.body.message).toBe('string');
          });
      }
      const r = await request(app.getHttpServer())
        .get('/api/v1/empleados?' + query)
        .set('Authorization', header)
        .expect(200);
      expect(r.body).toEqual({
        items: [],
        nextCursor: null,
        limit: 50,
        order: 'id:asc',
      });
      await request(app.getHttpServer())
        .get('/api/v1/empleados/' + OTHER + '?' + query)
        .set('Authorization', header)
        .expect(404)
        .expect((r) => expectNestError(r.body, 404));
      const period = `hospitalId=${H}&servicioId=${S}&desde=2026-11-16T00:00:00Z&hasta=2026-11-23T00:00:00Z`;
      await request(app.getHttpServer())
        .get('/api/v1/programaciones?' + period)
        .set('Authorization', header)
        .expect(403)
        .expect((r) => expectNestError(r.body, 403));
      expect(repo.staff).toHaveBeenCalledTimes(1);
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('OpenAPI describe los errores reales y UUID preservando las operaciones anteriores', async () => {
    const { app, forbidden } = await setup(false);
    try {
      const doc = createOpenApiDocument(app);
      const paths = [
        '/api/v1/empleados',
        '/api/v1/empleados/{empleadoId}',
        '/api/v1/contratos/{contratoId}/adscripciones',
        '/api/v1/programaciones',
        '/api/v1/tableros/coordinacion',
      ];
      const schema = doc.components?.schemas?.ReadHttpErrorDto;
      expect(schema).toMatchObject({
        type: 'object',
        required: ['statusCode', 'message', 'error'],
        properties: {
          statusCode: { type: 'integer' },
          error: { type: 'string' },
          message: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
        },
      });
      for (const route of paths) {
        const op = doc.paths[route].get!;
        expect(op.security).toEqual([{ bearer: [] }]);
        for (const code of [
          '400',
          '401',
          '403',
          '503',
          ...(route.endsWith('{empleadoId}') ? ['404'] : []),
        ])
          expect(op.responses[code]).toMatchObject({
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReadHttpErrorDto' },
              },
            },
          });
        if (!route.endsWith('{empleadoId}'))
          expect(op.responses['404']).toBeUndefined();
        for (const param of op.parameters ?? [])
          if ('in' in param && param.in === 'path')
            expect(param).toMatchObject({
              required: true,
              schema: { type: 'string', format: 'uuid' },
            });
      }
      const ids = Object.values(doc.paths).flatMap((item) =>
        Object.entries(item)
          .filter(([method]) =>
            [
              'get',
              'post',
              'put',
              'patch',
              'delete',
              'options',
              'head',
              'trace',
            ].includes(method),
          )
          .map(([, op]) => (op as { operationId: string }).operationId),
      );
      expect(ids).toHaveLength(21);
      expect(new Set(ids).size).toBe(21);
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
