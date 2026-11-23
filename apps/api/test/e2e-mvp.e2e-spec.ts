import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { OwnContextsRepository } from '../src/modules/iam/presentation/contexts.controller.js';
import { LaborRepository } from '../src/modules/gestion-laboral/labor.repository.js';
import {
  WorkforceReadGuard,
  WorkforceWriteGuard,
} from '../src/modules/gestion-laboral/labor.controller.js';
import { configureApp } from '../src/main.js';
import { iamFixture } from './fixtures/iam-mock.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  C = '33333333-3333-4333-8333-333333333333';
async function setup(enabled = false) {
  const f = iamFixture(),
    forbidden = vi.fn(() => {
      throw Error('MVP_LOCAL_TEST_FORBIDS_DATABASE');
    });
  const calls = {
    adscription: vi.fn(async () => ({
      adscripcionId: C,
      contratoId: C,
      servicioId: S,
      clase: 'NOMINAL',
      inicio: '2026-11-23',
      fin: '2026-11-30',
    })),
    incident: vi.fn(async () => ({
      incidenciaId: C,
      hospitalId: H,
      empleadoId: C,
      tipoIncidenciaId: C,
      inicio: '2026-11-24T06:00:00Z',
      fin: '2026-11-25T06:00:00Z',
      estado: 'CAPTURADA',
      capturadoPor: H,
      creadoEn: '2026-11-23T06:00:00Z',
    })),
    createHours: vi.fn(async () => ({ horarioId: C })),
    createPattern: vi.fn(),
    rotation: vi.fn(),
    assignPattern: vi.fn(),
  };
  const contexts = {
    list: vi.fn(async () => [
      {
        assignmentId: C,
        hospitalId: H,
        hospitalNombre: 'Hospital sintético asignado',
        zonaHoraria: 'America/Mexico_City',
        divisionId: null,
        divisionNombre: null,
        servicioId: null,
        servicioNombre: null,
        tipo: 'TITULAR',
        vigenteDesde: '2026-01-01T00:00:00Z',
        vigenteHasta: null,
        permisos: [],
      },
    ]),
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
    .overrideProvider(OwnContextsRepository)
    .useValue(contexts)
    .overrideProvider(LaborRepository)
    .useValue(calls);
  if (enabled)
    for (const guard of [WorkforceReadGuard, WorkforceWriteGuard])
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
  return { app, f, calls, contexts, forbidden, login };
}
describe('E2E-MVP HTTP local: contratos y guards, no persistencia real', () => {
  it('trece rutas laborales deshabilitadas antes de Pool o repositorio', async () => {
    const t = await setup();
    try {
      for (const [method, path] of [
        ['get', '/personal/elegibles'],
        ['get', '/servicios/' + S + '/distribucion'],
        ['get', '/horarios'],
        ['get', '/patrones-laborales'],
        ['get', '/incidencias'],
        ['get', '/incidencias/' + C + '/versiones'],
        ['post', '/contratos/' + C + '/adscripciones'],
        ['post', '/servicios/' + S + '/rotaciones'],
        ['post', '/horarios'],
        ['post', '/patrones-laborales'],
        ['post', '/contratos/' + C + '/patrones'],
        ['post', '/vacaciones'],
        ['post', '/incapacidades'],
      ] as const)
        await request(t.app.getHttpServer())
          [method]('/api/v1' + path)
          .expect(503);
      expect(t.forbidden).not.toHaveBeenCalled();
      expect(t.calls.incident).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('contextos propios no requieren facultad CATALOGOS_ADMINISTRAR ni enumeran hijos', async () => {
    const t = await setup();
    try {
      const token = await t.login();
      const r = await request(t.app.getHttpServer())
        .get('/api/v1/auth/me/contextos')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(r.body[0].hospitalNombre).toBe('Hospital sintético asignado');
      expect(r.body[0].servicioId).toBeNull();
      expect(r.body[0].permisos).toEqual([]);
      await request(t.app.getHttpServer())
        .get('/api/v1/auth/me/contextos?hospitalId=' + S)
        .auth(token, { type: 'bearer' })
        .expect(400);
      expect(t.contexts.list).toHaveBeenCalledTimes(1);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('sesión revocada no obtiene contextos', async () => {
    const t = await setup();
    try {
      const token = await t.login();
      for (const session of t.f.sessions.values())
        session.revocada_en = new Date();
      await request(t.app.getHttpServer())
        .get('/api/v1/auth/me/contextos')
        .auth(token, { type: 'bearer' })
        .expect(401);
      expect(t.contexts.list).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it.each([
    [
      '/contratos/' + C + '/adscripciones',
      {
        hospitalId: H,
        inicio: '2026-11-23',
        fin: '2026-11-30',
        clase: 'NOMINAL',
      },
    ],
    [
      '/incapacidades',
      {
        hospitalId: H,
        contratoId: C,
        tipoIncidenciaId: C,
        inicio: '2026-11-24T06:00:00Z',
        fin: '2026-11-25T06:00:00Z',
      },
    ],
    [
      '/vacaciones',
      {
        hospitalId: H,
        servicioId: S,
        contratoId: C,
        tipoIncidenciaId: C,
        inicio: '2026-11-24T06:00:00Z',
        fin: '2026-11-25T06:00:00Z',
        diagnostico: 'campo no admitido',
      },
    ],
    [
      '/horarios',
      {
        hospitalId: H,
        codigo: 'QA',
        nombre: 'QA',
        horaInicio: '25:00',
        horaFin: '07:30',
        cruzaMedianoche: true,
      },
    ],
    [
      '/patrones-laborales',
      {
        hospitalId: H,
        codigo: 'QA',
        nombre: 'QA',
        horarioId: C,
        clase: 'ORDINARIO',
        dias: [],
      },
    ],
  ] as const)(
    'DTO %s no acepta vínculos ausentes ni información no admitida',
    async (path, body) => {
      const t = await setup(true);
      try {
        const token = await t.login();
        await request(t.app.getHttpServer())
          .post('/api/v1' + path)
          .auth(token, { type: 'bearer' })
          .send(body)
          .expect(400);
        for (const call of Object.values(t.calls))
          expect(call).not.toHaveBeenCalled();
        expect(t.forbidden).not.toHaveBeenCalled();
      } finally {
        await t.app.close();
      }
    },
  );
  it('alta respeta contrato CAPTURADA con repositorio doble, sin aprobación ficticia', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      const r = await request(t.app.getHttpServer())
        .post('/api/v1/vacaciones')
        .auth(token, { type: 'bearer' })
        .send({
          hospitalId: H,
          servicioId: S,
          contratoId: C,
          tipoIncidenciaId: C,
          inicio: '2026-11-24T06:00:00Z',
          fin: '2026-11-25T06:00:00Z',
        })
        .expect(201);
      expect(r.body.estado).toBe('CAPTURADA');
      expect(r.body).not.toHaveProperty('diagnostico');
      expect(t.calls.incident).toHaveBeenCalledWith(
        expect.any(Object),
        'VACACIONES',
        expect.objectContaining({ contratoId: C, servicioId: S }),
      );
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
});
