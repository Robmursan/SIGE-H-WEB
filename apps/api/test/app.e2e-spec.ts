import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PostgresService } from '../src/database/postgres.service.js';
import { configureApp } from '../src/main.js';

describe('SIGE-H Sprint 0.2 — Infraestructura, Transacciones, Liveness/Readiness y Swagger (e2e)', () => {
  let app: INestApplication<App>;
  let postgresService: PostgresService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    postgresService = app.get<PostgresService>(PostgresService);
    configService = app.get<ConfigService>(ConfigService);

    // Verificación explícita de que el destino es un entorno QA/desarrollo local aislado
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');
    const dbHost = configService.get<string>('DB_HOST', '127.0.0.1');
    const dbName = configService.get<string>('DB_NAME', '');

    if (
      nodeEnv === 'production' ||
      (dbHost !== '127.0.0.1' && dbHost !== 'localhost') ||
      /prod/i.test(dbName)
    ) {
      throw new Error(
        `Ejecución E2E abortada por seguridad: destino (${dbHost}/${dbName}, NODE_ENV=${nodeEnv}) no es un entorno QA/desarrollo local aislado.`,
      );
    }
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

  it('CU-OPS-01: GET /api/v1/health/live retorna 200 OK (liveness del proceso)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'sige-h-api',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('CU-OPS-02: GET /api/v1/health/ready y GET /api/v1/health verifican PostgreSQL y esquema sigeh (200 OK)', async () => {
    const readyRes = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(readyRes.body).toMatchObject({
      status: 'ok',
      service: 'sige-h-api',
      database: {
        status: 'up',
        schema: 'sigeh',
        schemaVerified: true,
      },
    });
    expect(typeof readyRes.body.database.latencyMs).toBe('number');

    const compatRes = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(compatRes.body).toMatchObject({
      status: 'ok',
      service: 'sige-h-api',
      database: {
        status: 'up',
        schema: 'sigeh',
        schemaVerified: true,
      },
    });
  });

  it('verifica en modo solo lectura las 51 tablas maestras y los timeouts de sesión en PostgreSQL', async () => {
    const tableCountResult = await postgresService.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      ['sigeh'],
    );
    expect(tableCountResult.rows[0]?.total).toBe(51);

    const timeoutsResult = await postgresService.query<{
      statement_timeout: string;
      lock_timeout: string;
      idle_in_tx_timeout: string;
    }>(
      `SELECT
         current_setting('statement_timeout') AS statement_timeout,
         current_setting('lock_timeout') AS lock_timeout,
         current_setting('idle_in_transaction_session_timeout') AS idle_in_tx_timeout`,
    );

    expect(timeoutsResult.rows[0]?.statement_timeout).toBe('15s');
    expect(timeoutsResult.rows[0]?.lock_timeout).toBe('5s');
    expect(timeoutsResult.rows[0]?.idle_in_tx_timeout).toBe('30s');
  });

  it('recupera la transacción y reutiliza exactamente la misma sesión PostgreSQL (pg_backend_pid en pool max=1) tras ROLLBACK y tras error SQL silenciado', async () => {
    const schema = configService.get<string>('DB_SCHEMA', 'sigeh');
    const singleSessionPool = new Pool({
      host: configService.get<string>('DB_HOST', '127.0.0.1'),
      port: configService.get<number>('DB_PORT', 5432),
      user: configService.get<string>('DB_USER'),
      password: configService.get<string>('DB_PASSWORD'),
      database: configService.get<string>('DB_NAME'),
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      application_name: 'sigeh-api-single-session-e2e',
      options: `-c search_path=${schema},public -c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000`,
    });

    const singleConnService = new PostgresService(
      singleSessionPool,
      configService,
    );

    try {
      const initialSession = await singleConnService.query<{
        pid: number;
        app_name: string;
        txid: string | null;
      }>(
        `SELECT
           pg_backend_pid() AS pid,
           current_setting('application_name') AS app_name,
           txid_current_if_assigned()::text AS txid`,
      );
      const pidBefore = initialSession.rows[0]?.pid;
      expect(typeof pidBefore).toBe('number');
      expect(initialSession.rows[0]?.app_name).toBe(
        'sigeh-api-single-session-e2e',
      );
      expect(initialSession.rows[0]?.txid).toBeNull();

      // 1. Transacción que lanza excepción y ejecuta ROLLBACK en la única sesión del pool (max=1)
      let pidInsideTx: number | undefined;
      await expect(
        singleConnService.withTransaction(async (client) => {
          await client.query("SET LOCAL application_name = 'sigeh-tx-test'");
          const txState = await client.query<{
            pid: number;
            app_name: string;
          }>(
            `SELECT
               pg_backend_pid() AS pid,
               current_setting('application_name') AS app_name`,
          );
          pidInsideTx = txState.rows[0]?.pid;
          expect(pidInsideTx).toBe(pidBefore);
          expect(txState.rows[0]?.app_name).toBe('sigeh-tx-test');

          throw new Error(
            'Abortar transacción de prueba sin persistir cambios',
          );
        }),
      ).rejects.toThrow('Abortar transacción de prueba sin persistir cambios');

      // Verificar en la MISMA sesión (pg_backend_pid idéntico) que la transacción fue recuperada
      const afterRollback = await singleConnService.query<{
        pid: number;
        app_name: string;
        txid: string | null;
        ok: number;
      }>(
        `SELECT
           pg_backend_pid() AS pid,
           current_setting('application_name') AS app_name,
           txid_current_if_assigned()::text AS txid,
           1 AS ok`,
      );

      expect(afterRollback.rows[0]?.pid).toBe(pidBefore);
      expect(afterRollback.rows[0]?.app_name).toBe(
        'sigeh-api-single-session-e2e',
      );
      expect(afterRollback.rows[0]?.txid).toBeNull();
      expect(afterRollback.rows[0]?.ok).toBe(1);

      // 2. Callback que captura internamente un error SQL ('SELECT 1/0') y retorna normalmente:
      // PostgreSQL devuelve command='ROLLBACK' al ejecutar COMMIT y withTransaction debe lanzar error
      await expect(
        singleConnService.withTransaction(async (client) => {
          try {
            await client.query('SELECT 1 / 0');
          } catch {
            // Error SQL silenciado por el callback
          }
          return 'falso-exito-no-permitido';
        }),
      ).rejects.toThrow(
        /Transacción abortada: PostgreSQL devolvió 'ROLLBACK' al ejecutar COMMIT/,
      );

      // Verificar que la misma sesión sigue operativa y limpia para consultas posteriores
      const afterAbortedCommit = await singleConnService.query<{
        pid: number;
        txid: string | null;
        ok: number;
      }>(
        `SELECT
           pg_backend_pid() AS pid,
           txid_current_if_assigned()::text AS txid,
           1 AS ok`,
      );

      expect(afterAbortedCommit.rows[0]?.pid).toBe(pidBefore);
      expect(afterAbortedCommit.rows[0]?.txid).toBeNull();
      expect(afterAbortedCommit.rows[0]?.ok).toBe(1);
    } finally {
      await singleConnService.onModuleDestroy();
    }
  });

  it('CU-OPS-02: GET /api/v1/health/ready y GET /api/v1/health retornan 503 sanitizado cuando falla PostgreSQL', async () => {
    const readinessSpy = vi
      .spyOn(postgresService, 'checkReadiness')
      .mockRejectedValueOnce(
        new Error(
          'Fallo simulado postgresql://sigeh_admin:Secret123@127.0.0.1:5432/sigeh_db',
        ),
      );

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      service: 'sige-h-api',
      database: {
        status: 'down',
        schema: 'sigeh',
        schemaVerified: false,
      },
      message: 'Base de datos PostgreSQL no disponible',
    });
    expect(JSON.stringify(response.body)).not.toContain('Secret123');

    readinessSpy.mockRestore();
  });

  it('GET /docs y GET /docs/openapi.json exponen únicamente rutas reales implementadas', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);

    const openApiResponse = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);

    expect(openApiResponse.body.info?.title).toBe('SIGE-H API');
    const paths = Object.keys(openApiResponse.body.paths ?? {});
    expect(paths).toEqual([
      '/api/v1',
      '/api/v1/health/live',
      '/api/v1/health/ready',
      '/api/v1/health',
    ]);

    expect(
      openApiResponse.body.paths['/api/v1/health/live']?.get?.operationId,
    ).toBe('getHealthLive');
    expect(
      openApiResponse.body.paths['/api/v1/health/ready']?.get?.operationId,
    ).toBe('getHealthReady');
    expect(openApiResponse.body.paths['/api/v1/health']?.get?.operationId).toBe(
      'getHealth',
    );
  });
});
