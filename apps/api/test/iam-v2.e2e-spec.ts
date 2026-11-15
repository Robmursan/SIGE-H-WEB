import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { configureApp } from '../src/main.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { PasswordHasher } from '../src/modules/iam/domain/password-hasher.js';
import { IamRepository } from '../src/modules/iam/infrastructure/iam.repository.js';
import { AccessRepository } from '../src/modules/iam/infrastructure/access.repository.js';
import { iamFixture, OTHER } from './fixtures/iam-mock.js';

describe('IAM V2 HTTP con persistencia mock, nunca QA', () => {
  let app: INestApplication;
  let f: ReturnType<typeof iamFixture>;
  const tripwire = vi.fn(() => {
    throw new Error('PG_FORBIDDEN');
  });
  beforeEach(async () => {
    f = iamFixture();
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query: tripwire, connect: tripwire, end: vi.fn() })
      .overrideProvider(AppService)
      .useFactory({ factory: () => new AppService() })
      .overrideProvider(IamSettings)
      .useValue(f.settings)
      .overrideProvider(PasswordHasher)
      .useValue(f.passwords)
      .overrideProvider(IamRepository)
      .useValue(f.repository)
      .overrideProvider(AccessRepository)
      .useValue(f.access)
      .compile();
    app = fixture.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    expect(tripwire).not.toHaveBeenCalled();
  });
  async function login() {
    return (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identificador: 'cuenta_ficticia', password: f.password })
        .expect(200)
    ).body as { accessToken: string; refreshToken: string; sessionId: string };
  }
  it('login, perfil, sesiones propias, rotación y logout coherentes', async () => {
    const first = await login();
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(me.body)).not.toContain(first.accessToken);
    expect(JSON.stringify(me.body)).not.toContain(f.password);
    const sessions = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0].sessionId).toBe(first.sessionId);
    expect(JSON.stringify(sessions.body)).not.toMatch(/token|password|hash/i);
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .auth(second.body.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(second.body.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('no permite consultar/revocar sesión ajena, sí la propia', async () => {
    const own = await login();
    f.sessions.set(OTHER, {
      ...f.sessions.get(own.sessionId)!,
      sesion_id: OTHER,
      usuario_id: OTHER,
    });
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/' + OTHER)
      .auth(own.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/' + own.sessionId)
      .auth(own.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .auth(own.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('respuestas genéricas sin credenciales y validación estricta', async () => {
    f.passwords.verify.mockResolvedValue(false);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identificador: 'cuenta_ficticia', password: f.password })
      .expect(401);
    expect(response.body.message).toBe('Credenciales o sesión inválidas');
    expect(JSON.stringify(response.body)).not.toContain(f.password);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identificador: 'cuenta_ficticia',
        password: f.password,
        isAdmin: true,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid' })
      .expect(400);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('oculta errores internos de persistencia sin filtrar secretos', async () => {
    vi.spyOn(f.repository, 'transaction').mockRejectedValueOnce(
      new Error(f.password),
    );
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identificador: 'cuenta_ficticia', password: f.password })
      .expect(503);
    expect(r.body.message).toBe('IAM no disponible');
    expect(JSON.stringify(r.body)).not.toContain(f.password);
  });
  it('rate limit persistido devuelve 429 también sin cuenta existente', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identificador: 'desconocida', password: f.password })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identificador: 'desconocida', password: f.password })
      .expect(429);
  });
  it('renovación concurrente y replay invalidan también el ganador', async () => {
    const first = await login();
    const results = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: first.refreshToken }),
      ),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 401,
    ]);
    const token = results.find((r) => r.status === 200)!.body.accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
  it('Swagger describe solo rutas reales y no ejemplos de secretos', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);
    expect(body.paths['/api/v1/auth/login'].post.operationId).toBe('iamLogin');
    expect(
      body.paths['/api/v1/auth/sessions/{sessionId}'].delete.operationId,
    ).toBe('iamRevokeSession');
    expect(body.components.schemas.LoginDto.properties.password.writeOnly).toBe(
      true,
    );
    expect(body.paths['/api/v1/auth/me'].get.security).toEqual([
      { bearer: [] },
    ]);
    expect(JSON.stringify(body)).not.toContain(f.password);
  });
});
