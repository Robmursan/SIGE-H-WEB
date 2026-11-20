import { Test } from '@nestjs/testing';
import { HttpException, ValidationPipe, type Type } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { configureApp, createOpenApiDocument } from '../src/main.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { AccessRepository } from '../src/modules/iam/infrastructure/access.repository.js';
import { OrganizationRepository } from '../src/modules/organizacion/infrastructure/organization.repository.js';
import {
  OrganizationReferenceQueryDto,
  HospitalReferenceQueryDto,
  DivisionReferenceQueryDto,
  ServiceReferenceQueryDto,
} from '../src/modules/organizacion/dto/organization-reference.dto.js';
import { iamFixture, OTHER } from './fixtures/iam-mock.js';
const H = '11111111-1111-4111-8111-111111111111',
  D = '22222222-2222-4222-8222-222222222222',
  S = '33333333-3333-4333-8333-333333333333';
async function setup() {
  const f = iamFixture();
  f.access.assignments.mockResolvedValue([
    {
      kind: 'TITULAR',
      mandateFrom: new Date('2026-01-01'),
      mandateUntil: null,
      encargoPermissions: [],
      usuarioActivo: true,
      hospitalActivo: true,
      scope: { hospitalId: H, divisionId: null, servicioId: null },
      division: null,
      servicio: null,
      vigenteDesde: new Date('2026-01-01'),
      vigenteHasta: null,
      observedAt: new Date(),
      permissions: ['CATALOGOS_ADMINISTRAR'],
    },
  ] as never);
  const forbidden = vi.fn(() => {
    throw Error('NO_DATABASE_IN_LOCAL_CONTRACT_TEST');
  });
  const references = vi.fn(
    async (_id: string, _catalog: string, q: { limit: number }) => ({
      items: [],
      nextCursor: null,
      limit: q.limit,
      order: 'id:asc',
    }),
  );
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
    .overrideProvider(AppService)
    .useFactory({ factory: () => new AppService() })
    .overrideProvider(IamSettings)
    .useValue(f.settings)
    .overrideProvider(IamService)
    .useValue(f.service)
    .overrideProvider(AccessRepository)
    .useValue(f.access)
    .overrideProvider(OrganizationRepository)
    .useValue({ references })
    .compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const login = async () =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identificador: 'cuenta_ficticia', password: f.password })
        .expect(200)
    ).body as { accessToken: string; refreshToken: string; sessionId: string };
  return { app, f, forbidden, references, login };
}
function bodyError(
  body: Record<string, unknown>,
  code: number,
  hasError = true,
) {
  expect(Object.keys(body).sort()).toEqual(
    hasError ? ['error', 'message', 'statusCode'] : ['message', 'statusCode'],
  );
  expect(body.statusCode).toBe(code);
  expect(
    typeof body.message === 'string' ||
      (Array.isArray(body.message) &&
        body.message.every((x) => typeof x === 'string')),
  ).toBe(true);
  if (hasError) expect(typeof body.error).toBe('string');
}
describe('IAM/ORG contrato HTTP y metadatos, sin PostgreSQL', () => {
  it('DTOs documentales heredan exactamente la validación y defaults originales', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    });
    const capture = async (type: Type<unknown>, input: unknown) => {
      try {
        return {
          ok: JSON.parse(
            JSON.stringify(
              await pipe.transform(input, { type: 'query', metatype: type }),
            ),
          ) as unknown,
        };
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        return { error: e.getResponse() };
      }
    };
    for (const type of [
      HospitalReferenceQueryDto,
      DivisionReferenceQueryDto,
      ServiceReferenceQueryDto,
    ])
      for (const input of [
        {},
        { hospitalId: H },
        {
          hospitalId: H,
          divisionId: D,
          servicioId: S,
          cursor: OTHER,
          limit: '25',
        },
        { hospitalId: null },
        { hospitalId: 'bad' },
        { limit: '101' },
        { limit: '0' },
        { extra: 'bad' },
      ])
        expect(await capture(type, input)).toEqual(
          await capture(OrganizationReferenceQueryDto, input),
        );
  });
  it('ORG conserva filtros permitidos, rechazos y hospital query redundante', async () => {
    const { app, login, references, forbidden } = await setup();
    try {
      const { accessToken } = await login();
      const get = (url: string) =>
        request(app.getHttpServer())
          .get('/api/v1' + url)
          .auth(accessToken, { type: 'bearer' });
      await get('/hospitales?hospitalId=' + H + '&limit=10').expect(200);
      await get('/hospitales?divisionId=' + D)
        .expect(400)
        .expect((r) => bodyError(r.body, 400));
      await get('/hospitales?servicioId=' + S).expect(400);
      await get('/hospitales/' + H + '/divisiones?divisionId=' + D).expect(200);
      await get(
        '/hospitales/' + H + '/divisiones?hospitalId=' + H.toUpperCase(),
      ).expect(200);
      await get('/hospitales/' + H + '/divisiones?hospitalId=' + OTHER).expect(
        400,
      );
      await get('/hospitales/' + H + '/divisiones?servicioId=' + S).expect(400);
      await get('/hospitales/not-a-uuid/divisiones')
        .expect(400)
        .expect((r) => bodyError(r.body, 400));
      await get('/servicios')
        .expect(400)
        .expect((r) => bodyError(r.body, 400));
      await get(
        '/servicios?hospitalId=' + H + '&divisionId=' + D + '&servicioId=' + S,
      ).expect(200);
      for (const url of [
        '/hospitales?unexpected=1',
        '/hospitales/' + H + '/divisiones?unexpected=1',
        '/servicios?hospitalId=' + H + '&unexpected=1',
      ])
        await get(url).expect(400);
      expect(references).toHaveBeenCalledTimes(4);
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('ORG 401/403/503 usan el cuerpo estándar sin sustituir autorización real', async () => {
    const { app, f, login, forbidden } = await setup();
    try {
      const token = await login();
      const urls = [
        '/hospitales',
        '/hospitales/' + H + '/divisiones',
        '/servicios?hospitalId=' + H,
      ];
      for (const url of urls) {
        await request(app.getHttpServer())
          .get('/api/v1' + url)
          .expect(401)
          .expect((r) => bodyError(r.body, 401));
      }
      f.access.assignments.mockResolvedValue([]);
      for (const url of urls)
        await request(app.getHttpServer())
          .get('/api/v1' + url)
          .auth(token.accessToken, { type: 'bearer' })
          .expect(403)
          .expect((r) => bodyError(r.body, 403));
      (f.settings as { enabled: boolean }).enabled = false;
      for (const url of urls)
        await request(app.getHttpServer())
          .get('/api/v1' + url)
          .expect(503)
          .expect((r) => bodyError(r.body, 503));
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('IAM conserva la respuesta de JSON mal formado del adaptador', async () => {
    const { app, forbidden } = await setup();
    try {
      for (const route of ['login', 'refresh'])
        await request(app.getHttpServer())
          .post('/api/v1/auth/' + route)
          .set('Content-Type', 'application/json')
          .send('{')
          .expect(400)
          .expect((r) => bodyError(r.body, 400));
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('IAM 429 real de login y refresh no contiene error', async () => {
    const { app, f, forbidden } = await setup();
    try {
      vi.spyOn(f.tx, 'attempt').mockResolvedValue(false);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identificador: 'cuenta_ficticia', password: f.password })
        .expect(429)
        .expect((r) => bodyError(r.body, 429, false));
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a'.repeat(64) })
        .expect(429)
        .expect((r) => bodyError(r.body, 429, false));
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('IAM revocación UUID y logout con sesión desaparecida conservan errores 400/404', async () => {
    const { app, f, login, forbidden } = await setup();
    try {
      const token = await login();
      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions/not-a-uuid')
        .auth(token.accessToken, { type: 'bearer' })
        .expect(400)
        .expect((r) => bodyError(r.body, 400));
      vi.spyOn(f.tx, 'lockSession').mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .auth(token.accessToken, { type: 'bearer' })
        .expect(404)
        .expect((r) => bodyError(r.body, 404));
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('OpenAPI expone parámetros exactos, UUID y esquemas/estados IAM/ORG', async () => {
    const { app, forbidden } = await setup();
    try {
      const doc = createOpenApiDocument(app);
      for (const [route, names] of [
        ['/api/v1/hospitales', ['hospitalId', 'cursor', 'limit']],
        [
          '/api/v1/hospitales/{hospitalId}/divisiones',
          ['hospitalId', 'divisionId', 'cursor', 'limit'],
        ],
        [
          '/api/v1/servicios',
          ['hospitalId', 'divisionId', 'servicioId', 'cursor', 'limit'],
        ],
      ] as const) {
        const params = doc.paths[route].get!.parameters!.filter(
          (p) => 'in' in p && p.in === 'query',
        );
        expect(params.map((p) => ('name' in p ? p.name : '')).sort()).toEqual(
          [...names].sort(),
        );
        for (const p of params)
          if ('name' in p)
            expect(p.required).toBe(
              route === '/api/v1/servicios' && p.name === 'hospitalId',
            );
      }
      for (const [route, method, name] of [
        ['/api/v1/auth/sessions/{sessionId}', 'delete', 'sessionId'],
        ['/api/v1/hospitales/{hospitalId}/divisiones', 'get', 'hospitalId'],
      ] as const) {
        expect(
          doc.paths[route][method]!.parameters!.find(
            (p) => 'in' in p && p.in === 'path',
          ),
        ).toMatchObject({
          name,
          required: true,
          schema: { type: 'string', format: 'uuid' },
        });
      }
      const matrix = {
        iamLogin: ['400', '401', '429', '503'],
        iamRefresh: ['400', '401', '429', '503'],
        iamMe: ['401', '503'],
        iamLogout: ['401', '404', '503'],
        iamSessions: ['401', '503'],
        iamRevokeSession: ['400', '401', '404', '503'],
        listAuthorizedHospitals: ['400', '401', '403', '503'],
        listAuthorizedDivisions: ['400', '401', '403', '503'],
        listAuthorizedServices: ['400', '401', '403', '503'],
      };
      for (const item of Object.values(doc.paths))
        for (const method of ['get', 'post', 'delete'] as const) {
          const op = item[method];
          if (!op || !(op.operationId! in matrix)) continue;
          const codes = matrix[op.operationId as keyof typeof matrix];
          expect(
            Object.keys(op.responses)
              .filter((c) => Number(c) >= 400)
              .sort(),
          ).toEqual([...codes].sort());
          for (const code of codes)
            expect(op.responses[code]).toMatchObject({
              content: {
                'application/json': {
                  schema: {
                    $ref:
                      '#/components/schemas/' +
                      (code === '429'
                        ? 'IamRateLimitErrorDto'
                        : 'ReadHttpErrorDto'),
                  },
                },
              },
            });
        }
      expect(doc.components!.schemas!.IamRateLimitErrorDto).toMatchObject({
        required: ['statusCode', 'message'],
      });
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
