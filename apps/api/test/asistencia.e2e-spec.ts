import { Test } from '@nestjs/testing';
import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { AccessRepository } from '../src/modules/iam/infrastructure/access.repository.js';
import { type PersistedAssignment } from '../src/modules/iam/domain/access-policy.js';
import { AsistenciaRepository } from '../src/modules/asistencia/asistencia.repository.js';
import { AttendanceAvailabilityGuard } from '../src/modules/asistencia/asistencia.service.js';
import { configureApp, createOpenApiDocument } from '../src/main.js';
import { iamFixture } from './fixtures/iam-mock.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  D = '33333333-3333-4333-8333-333333333333',
  OTHER = '99999999-9999-4999-8999-999999999999';
const get =
    '/api/v1/pases-lista?hospitalId=' +
    H +
    '&servicioId=' +
    S +
    '&fecha=2026-11-22',
  put = '/api/v1/programaciones/' + S + '/asistencia';
const b = { estado: 'PRESENTE', expectedRevision: '0' };
function assignment(): PersistedAssignment {
  return {
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
    observedAt: new Date('2026-11-22'),
    permissions: ['ASISTENCIA_CAPTURAR'],
  };
}
async function setup(enabled = true) {
  const f = iamFixture();
  let grant = assignment();
  f.access.assignments.mockImplementation(async () => [grant] as never);
  const forbidden = vi.fn(() => {
    throw Error('ATTENDANCE_HTTP_MUST_NOT_CONNECT_PG');
  });
  const ack = {
    programacionId: S,
    asistenciaId: D,
    eventoId: '9007199254740993',
    revision: '9007199254740993',
    estadoOperativo: 'PRESENTE',
    validacionAdministrativa: 'PENDIENTE',
    actorId: H,
    registradoEn: '2026-11-22T10:00:00.000Z',
  };
  const repo = {
    list: vi.fn(async () => ({
      hospitalId: H,
      servicioId: S,
      fecha: '2026-11-22',
      zonaHoraria: 'America/Mexico_City',
      items: [],
      nextCursor: null,
      limit: 50,
      order: 'id:asc',
    })),
    capture: vi.fn(
      async (
        _p: unknown,
        id: string,
        _key: string,
        _b: unknown,
        authorize: (s: object) => Promise<void>,
      ) => {
        if (id !== S) throw new NotFoundException('Programación no disponible');
        await authorize({ hospitalId: H, servicioId: S });
        return ack;
      },
    ),
  };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppService)
    .useFactory({ factory: () => new AppService() })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
    .overrideProvider(IamSettings)
    .useValue(f.settings)
    .overrideProvider(IamService)
    .useValue(f.service)
    .overrideProvider(AccessRepository)
    .useValue(f.access)
    .overrideProvider(AsistenciaRepository)
    .useValue(repo);
  if (enabled) {
    const ready = { requireEnabled: () => {}, canActivate: () => true };
    builder = builder
      .overrideGuard(AttendanceAvailabilityGuard)
      .useValue(ready)
      .overrideProvider(AttendanceAvailabilityGuard)
      .useValue(ready);
  }
  const module = await builder.compile(),
    app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const token = await f.service.login(
    'cuenta_ficticia',
    f.password,
    'synthetic',
  );
  const header = 'Bearer ' + token.accessToken;
  return {
    app,
    f,
    repo,
    forbidden,
    header,
    setGrant: (v: Partial<PersistedAssignment>) => {
      grant = { ...grant, ...v };
    },
  };
}
describe('CU-ASI HTTP local, IAM real sobre fixture y repositorio simulado', () => {
  it('dos rutas 503 por defecto, sin abrir PG ni publicar listener', async () => {
    const t = await setup(false);
    try {
      await request(t.app.getHttpServer()).get(get).expect(503);
      await request(t.app.getHttpServer()).put(put).send(b).expect(503);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('401, consulta paginada y acuse de captura sin credenciales', async () => {
    const t = await setup();
    try {
      await request(t.app.getHttpServer()).get(get).expect(401);
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(200)
        .expect((r) => expect(r.body.items).toEqual([]));
      const r = await request(t.app.getHttpServer())
        .put(put)
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(200);
      expect(r.body.revision).toBe('9007199254740993');
      expect(JSON.stringify(r.body)).not.toMatch(
        /rud|password|token|validado_por/i,
      );
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('rechaza UUID, fecha, extra, nulos, límite y clave de idempotencia', async () => {
    const t = await setup();
    try {
      for (const suffix of [
        '&limit=101',
        '&cursor=x',
        '&fecha=bad',
        '&extra=true',
        '&horarioId=bad',
      ])
        await request(t.app.getHttpServer())
          .get(get + suffix)
          .set('Authorization', t.header)
          .expect(400);
      await request(t.app.getHttpServer())
        .get(get.replace('2026-11-22', '2026-02-30'))
        .set('Authorization', t.header)
        .expect(400);
      for (const key of ['', 'invalid', '11111111-1111-1111-8111-111111111111'])
        await request(t.app.getHttpServer())
          .put(put)
          .set('Authorization', t.header)
          .set('Idempotency-Key', key)
          .send(b)
          .expect(400);
      for (const bad of [
        { ...b, estado: 'NO_EXIGIBLE' },
        { ...b, expectedRevision: 0 },
        { ...b, actorId: H },
        { ...b, llegada: null },
      ])
        await request(t.app.getHttpServer())
          .put(put)
          .set('Authorization', t.header)
          .set('Idempotency-Key', D)
          .send(bad)
          .expect(400);
      await request(t.app.getHttpServer())
        .put(put.replace(S, 'invalid'))
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(400);
      expect(t.repo.capture).not.toHaveBeenCalled();
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('niega hospital/servicio cruzados, usuario sin facultad y consulta por catálogo', async () => {
    const t = await setup();
    try {
      for (const url of [get.replace(H, OTHER), get.replace(S, OTHER)])
        await request(t.app.getHttpServer())
          .get(url)
          .set('Authorization', t.header)
          .expect(403);
      await request(t.app.getHttpServer())
        .put(put.replace(S, OTHER))
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(404);
      t.setGrant({ permissions: ['CATALOGOS_ADMINISTRAR'] });
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(403);
      await request(t.app.getHttpServer())
        .put(put)
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(403);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('ENCARGADO sin permiso o mandato vencido denegado, explícito vigente aceptado', async () => {
    const t = await setup();
    try {
      t.setGrant({ kind: 'ENCARGADO', mandateUntil: new Date('2026-12-01') });
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(403);
      t.setGrant({ encargoPermissions: ['ASISTENCIA_CAPTURAR'] });
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(200);
      t.setGrant({ mandateUntil: new Date('2026-11-21') });
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(403);
    } finally {
      await t.app.close();
    }
  });
  it('VALIDAR permite consultar pero no capturar; revocación produce 401', async () => {
    const t = await setup();
    try {
      t.setGrant({ permissions: ['ASISTENCIA_VALIDAR'] });
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(200);
      await request(t.app.getHttpServer())
        .put(put)
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(403);
      const principal = await t.f.service.verify(t.header);
      await t.f.service.revoke(principal, principal.sesionId);
      await request(t.app.getHttpServer())
        .get(get)
        .set('Authorization', t.header)
        .expect(401);
    } finally {
      await t.app.close();
    }
  });
  it('errores de persistencia sanitizados y conflicto documentado', async () => {
    const t = await setup();
    try {
      t.repo.capture.mockRejectedValueOnce(
        new ConflictException('YA_REGISTRADA'),
      );
      await request(t.app.getHttpServer())
        .put(put)
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(409);
      t.repo.capture.mockRejectedValueOnce(
        new Error('INTERNAL_SECRET_SHOULD_NEVER_LEAK'),
      );
      await request(t.app.getHttpServer())
        .put(put)
        .set('Authorization', t.header)
        .set('Idempotency-Key', D)
        .send(b)
        .expect(503)
        .expect((r) =>
          expect(JSON.stringify(r.body)).not.toContain('INTERNAL_SECRET'),
        );
    } finally {
      await t.app.close();
    }
  });
  it('OpenAPI real: 21 operaciones, UUID, idempotencia, errores y respuestas tipadas', async () => {
    const t = await setup(false);
    try {
      const d = createOpenApiDocument(t.app),
        op = d.paths['/api/v1/programaciones/{programacionId}/asistencia'].put!;
      expect(op.operationId).toBe('captureInitialAttendance');
      expect(op.security).toEqual([{ bearer: [] }]);
      for (const code of ['400', '401', '403', '404', '409', '503'])
        expect(op.responses[code]).toMatchObject({
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReadHttpErrorDto' },
            },
          },
        });
      expect(op.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: expect.objectContaining({ format: 'uuid' }),
          }),
          expect.objectContaining({
            name: 'programacionId',
            in: 'path',
            schema: expect.objectContaining({ format: 'uuid' }),
          }),
        ]),
      );
      expect(
        d.paths['/api/v1/pases-lista'].get!.parameters!.map((p) =>
          'name' in p ? p.name : '',
        ),
      ).toEqual(
        expect.arrayContaining([
          'hospitalId',
          'servicioId',
          'fecha',
          'horarioId',
          'cursor',
          'limit',
        ]),
      );
      expect(Object.keys(d.paths)).toHaveLength(21);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
});
