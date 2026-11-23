import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppService } from '../src/app.service.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { CalendarPublicationGuard } from '../src/modules/calendario/calendar-publication.controller.js';
import { WorkforceReadGuard } from '../src/modules/gestion-laboral/labor.controller.js';
import { LaborRepository } from '../src/modules/gestion-laboral/labor.repository.js';
import { configureApp } from '../src/config/http-app.js';
import { iamFixture } from './fixtures/iam-mock.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222';
const body = {
  hospitalId: H,
  servicioId: S,
  fecha: '2026-11-24',
  fingerprint: 'a'.repeat(64),
  policyVersion: 'SYNTHETIC_NOT_APPROVED',
};
async function setup(enabled = false) {
  const f = iamFixture(),
    forbidden = vi.fn(() => {
      throw Error('NO_DATABASE_IN_LOCAL_HTTP');
    });
  const configuration = vi.fn(async () => ({
    contratoId: S,
    hospitalId: H,
    servicioId: S,
    empleadoId: S,
    fecha: body.fecha,
    patrones: [],
    conflictos: ['PATRON_FALTANTE'],
  }));
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppService)
    .useFactory({ factory: () => new AppService() })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
    .overrideProvider(IamSettings)
    .useValue(f.settings)
    .overrideProvider(IamService)
    .useValue(f.service)
    .overrideProvider(LaborRepository)
    .useValue({ configuration });
  if (enabled)
    for (const guard of [CalendarPublicationGuard, WorkforceReadGuard])
      builder = builder
        .overrideGuard(guard)
        .useValue({ canActivate: () => true });
  const module = await builder.compile(),
    app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const login = async () =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identificador: 'cuenta_ficticia', password: f.password })
        .expect(200)
    ).body.accessToken as string;
  return { app, forbidden, configuration, login };
}
describe('MVP-02: puertas de publicación y consulta laboral HTTP sin PostgreSQL', () => {
  it('ambas rutas deshabilitadas antes de Pool', async () => {
    const t = await setup();
    try {
      await request(t.app.getHttpServer())
        .post('/api/v1/programaciones/generar')
        .send(body)
        .expect(503);
      await request(t.app.getHttpServer())
        .get(
          `/api/v1/contratos/${S}/configuracion-laboral?hospitalId=${H}&servicioId=${S}&fecha=${body.fecha}`,
        )
        .expect(503);
      expect(t.forbidden).not.toHaveBeenCalled();
      expect(t.configuration).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('publicación requiere autenticación aun con guard temporal habilitado', async () => {
    const t = await setup(true);
    try {
      await request(t.app.getHttpServer())
        .post('/api/v1/programaciones/generar')
        .send(body)
        .expect(401);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('rechaza clave ausente o alterada con 422; no obtiene cliente', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      for (const key of ['', 'invalid']) {
        const r = request(t.app.getHttpServer())
          .post('/api/v1/programaciones/generar')
          .auth(token, { type: 'bearer' })
          .send(body);
        if (key) r.set('Idempotency-Key', key);
        await r.expect(422);
      }
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('una clave válida no sustituye aprobación institucional: 503 sin SQL', async () => {
    const t = await setup(true);
    try {
      await request(t.app.getHttpServer())
        .post('/api/v1/programaciones/generar')
        .auth(await t.login(), { type: 'bearer' })
        .set('Idempotency-Key', H)
        .send(body)
        .expect(503);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('el cliente no puede enviar políticas, jornadas o asistencia para saltar revalidación', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      for (const extra of [
        { approved: true },
        { candidates: [] },
        { estado: 'PRESENTE' },
        { policyVersion: '' },
        { servicioId: 'wrong' },
      ])
        await request(t.app.getHttpServer())
          .post('/api/v1/programaciones/generar')
          .auth(token, { type: 'bearer' })
          .set('Idempotency-Key', H)
          .send({ ...body, ...extra })
          .expect(400);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('consulta laboral exige servicio y fecha y no inventa filtros', async () => {
    const t = await setup(true);
    try {
      const token = await t.login(),
        url = `/api/v1/contratos/${S}/configuracion-laboral?hospitalId=${H}`;
      for (const suffix of [
        `&fecha=${body.fecha}`,
        `&servicioId=${S}`,
        `&servicioId=${S}&fecha=${body.fecha}&limit=100`,
        `&servicioId=invalid&fecha=${body.fecha}`,
      ])
        await request(t.app.getHttpServer())
          .get(url + suffix)
          .auth(token, { type: 'bearer' })
          .expect(400);
      expect(t.configuration).not.toHaveBeenCalled();
      const r = await request(t.app.getHttpServer())
        .get(url + `&servicioId=${S}&fecha=${body.fecha}`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(r.body.conflictos).toEqual(['PATRON_FALTANTE']);
      expect(r.body).not.toHaveProperty('rud');
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
});
