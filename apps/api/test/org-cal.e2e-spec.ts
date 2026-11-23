import { Test } from '@nestjs/testing';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import {
  OrganizationAdminReadGuard,
  OrganizationAdminWriteGuard,
} from '../src/modules/organizacion/organization-admin.controller.js';
import { OrganizationAdminRepository } from '../src/modules/organizacion/organization-admin.repository.js';
import { CalendarSimulationGuard } from '../src/modules/calendario/calendar.controller.js';
import { CalendarSourceRepository } from '../src/modules/calendario/calendar-source.repository.js';
import { configureApp, createOpenApiDocument } from '../src/main.js';
import { iamFixture } from './fixtures/iam-mock.js';
import { calendarFixture, H, D, S, OTHER } from './fixtures/calendar.js';
async function setup(enabled = false) {
  const f = iamFixture();
  const forbidden = vi.fn(() => {
    throw Error('NO_REAL_DATABASE_ALLOWED');
  });
  const row = {
    id: D,
    hospitalId: H,
    clave: 'PRUEBA',
    nombre: 'Sintético',
    activo: true,
    revision: 'a'.repeat(64),
  };
  const repo = {
    create: vi.fn(
      async (_p: unknown, _entity: string, input: { hospitalId: string }) => {
        if (input.hospitalId !== H) throw new ForbiddenException('Ámbito');
        return row;
      },
    ),
    detail: vi.fn(async () => row),
    subareas: vi.fn(async () => ({ items: [], nextCursor: null, limit: 50 })),
    tree: vi.fn(async () => ({ divisiones: [], servicios: [], subareas: [] })),
    update: vi.fn(async () => {
      throw new ConflictException('Revisión obsoleta');
    }),
  };
  const source = {
    load: vi.fn(async (_p: unknown, scope: { hospitalId: string }) => {
      if (scope.hospitalId !== H) throw new ForbiddenException('Ámbito');
      return calendarFixture();
    }),
  };
  let b = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
    .overrideProvider(AppService)
    .useFactory({ factory: () => new AppService() })
    .overrideProvider(IamSettings)
    .useValue(f.settings)
    .overrideProvider(IamService)
    .useValue(f.service)
    .overrideProvider(OrganizationAdminRepository)
    .useValue(repo)
    .overrideProvider(CalendarSourceRepository)
    .useValue(source);
  if (enabled)
    for (const guard of [
      OrganizationAdminReadGuard,
      OrganizationAdminWriteGuard,
      CalendarSimulationGuard,
    ])
      b = b.overrideGuard(guard).useValue({ canActivate: () => true });
  const module = await b.compile(),
    app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const login = async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identificador: 'cuenta_ficticia', password: f.password })
      .expect(200);
    return r.body.accessToken as string;
  };
  return { app, f, repo, source, forbidden, login };
}
describe('ORG/CAL HTTP local con repositorios dobles: no PostgreSQL', () => {
  it('nuevas rutas quedan 503 por defecto sin tocar pool', async () => {
    const t = await setup();
    try {
      for (const [method, path] of [
        ['get', '/divisiones/' + D],
        ['get', '/servicios/' + S],
        ['get', '/subareas/' + D],
        ['get', '/servicios/' + S + '/subareas'],
        ['get', '/organizacion/arbol'],
        ['post', '/divisiones'],
        ['post', '/servicios'],
        ['post', '/subareas'],
        ['patch', '/divisiones/' + D],
        ['patch', '/servicios/' + S],
        ['patch', '/subareas/' + D],
        ['post', '/programaciones/simular'],
      ] as const)
        await request(t.app.getHttpServer())
          [method]('/api/v1' + path)
          .expect(503);
      expect(t.forbidden).not.toHaveBeenCalled();
      expect(t.source.load).not.toHaveBeenCalled();
      expect(t.repo.create).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('sin sesión 401 y con DTO desconocido 400 antes del repositorio', async () => {
    const t = await setup(true);
    try {
      await request(t.app.getHttpServer())
        .post('/api/v1/divisiones')
        .send({})
        .expect(401);
      const token = await t.login();
      await request(t.app.getHttpServer())
        .post('/api/v1/divisiones')
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: H, clave: 'X', nombre: 'X', activo: false })
        .expect(400);
      expect(t.repo.create).not.toHaveBeenCalled();
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('alta, denegación y conflicto preservan códigos HTTP', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      await request(t.app.getHttpServer())
        .post('/api/v1/divisiones')
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: H, clave: 'X', nombre: 'X' })
        .expect(201);
      await request(t.app.getHttpServer())
        .post('/api/v1/divisiones')
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: OTHER, clave: 'X', nombre: 'X' })
        .expect(403);
      await request(t.app.getHttpServer())
        .patch('/api/v1/divisiones/' + D + '?hospitalId=' + H)
        .auth(token, { type: 'bearer' })
        .send({ revision: 'a'.repeat(64), nombre: 'X' })
        .expect(409);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('simulación calcula mañana, no admite empleados ni fecha enviada', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      const endpoint = '/api/v1/programaciones/simular';
      await request(t.app.getHttpServer())
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({
          hospitalId: H,
          servicioId: S,
          fecha: '2026-11-21',
          empleados: [D],
        })
        .expect(400);
      const r = await request(t.app.getHttpServer())
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: H, servicioId: S })
        .expect(200);
      expect(r.body.date).toBe('2026-11-21');
      expect(r.body.businessWrites).toBe(false);
      expect(r.body.publishable).toBe(false);
      expect(r.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(r.body)).not.toMatch(/rud|password|token/i);
      await request(t.app.getHttpServer())
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: OTHER, servicioId: S })
        .expect(403);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('sesión revocada se rechaza antes de fuentes CAL', async () => {
    const t = await setup(true);
    try {
      const token = await t.login();
      for (const s of t.f.sessions.values()) s.revocada_en = new Date();
      await request(t.app.getHttpServer())
        .post('/api/v1/programaciones/simular')
        .auth(token, { type: 'bearer' })
        .send({ hospitalId: H, servicioId: S })
        .expect(401);
      expect(t.source.load).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('OpenAPI tipado conserva operaciones previas y agrega el circuito laboral deshabilitado', async () => {
    const t = await setup();
    try {
      const d = createOpenApiDocument(t.app);
      const operations = Object.values(d.paths).flatMap((p) =>
        Object.entries(p!)
          .filter(([m]) =>
            ['get', 'post', 'put', 'patch', 'delete'].includes(m),
          )
          .map(([, o]) => o),
      );
      expect(operations).toHaveLength(49);
      expect(new Set(operations.map((o) => o.operationId)).size).toBe(49);
      const op = d.paths['/api/v1/programaciones/simular']!.post!;
      expect(op.responses['200']).toBeDefined();
      for (const code of ['400', '401', '403', '503'])
        expect(JSON.stringify(op.responses[code])).toContain(
          'ReadHttpErrorDto',
        );
      const schema = d.components!.schemas!.CalendarSimulationDto as {
        properties: Record<string, { format: string }>;
      };
      expect(schema.properties.hospitalId!.format).toBe('uuid');
      expect(Object.keys(schema.properties).sort()).toEqual([
        'divisionId',
        'hospitalId',
        'servicioId',
      ]);
      expect(t.forbidden).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
});

describe('ORG/CAL DTO estrictos HTTP con dobles', () => {
  it.each([
    [
      'post',
      '/programaciones/simular',
      { hospitalId: 'invalid', servicioId: S },
    ],
    ['post', '/programaciones/simular', { hospitalId: H, serviceId: S }],
    [
      'post',
      '/subareas',
      { hospitalId: H, servicioId: S, divisionId: D, clave: 'X', nombre: 'X' },
    ],
    [
      'patch',
      '/divisiones/' + D + '?hospitalId=' + H,
      { revision: 'a'.repeat(64), clave: null },
    ],
    [
      'patch',
      '/divisiones/' + D + '?hospitalId=' + H,
      { revision: 'a'.repeat(64), hospitalId: OTHER, nombre: 'X' },
    ],
    ['patch', '/divisiones/' + D + '?hospitalId=' + H, { nombre: 'X' }],
  ] as const)(
    '%s %s rechaza entrada incompatible sin tocar repositorios',
    async (method, path, body) => {
      const t = await setup(true);
      try {
        const token = await t.login();
        await request(t.app.getHttpServer())
          [method]('/api/v1' + path)
          .auth(token, { type: 'bearer' })
          .send(body)
          .expect(400);
        expect(t.source.load).not.toHaveBeenCalled();
        expect(t.repo.create).not.toHaveBeenCalled();
        expect(t.repo.update).not.toHaveBeenCalled();
        expect(t.forbidden).not.toHaveBeenCalled();
      } finally {
        await t.app.close();
      }
    },
  );
});
