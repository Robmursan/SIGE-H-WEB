// Run after npm run build. Full compiled application: no replaced providers,
// no real PostgreSQL destination, no .env needed, no persistent server.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// ConfigModule resolves .env from cwd. A private empty cwd avoids loading any
// real configuration even when this command is run in an existing checkout.
const isolatedDirectory = await mkdtemp(join(tmpdir(), 'sigeh-ops-smoke-'));
const previousCwd = process.cwd();
process.chdir(isolatedDirectory);

Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: isolatedDirectory, // Empty private UNIX socket directory; no PG.
  DB_PORT: '5432',
  DB_NAME: 'no_database_for_ops_smoke',
  DB_SCHEMA: 'sigeh',
  DB_USER: 'no_database_user',
  DB_PASSWORD: randomBytes(32).toString('hex'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  JWT_EXPIRATION: '15m',
  DATABASE_URL: '',
  SWAGGER_ENABLED: 'true',
});

let app;
try {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { configureApp } = await import('../dist/main.js');
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();

  const versionResponse = await fetch(`${baseUrl}/api/v1/meta/version`);
  assert.equal(versionResponse.status, 200);
  assert.equal(versionResponse.headers.get('cache-control'), 'no-store');
  const metadata = await versionResponse.json();
  assert.deepEqual(metadata, { apiVersion: '1.0.0', apiBasePath: '/api/v1' });

  assert.equal((await fetch(`${baseUrl}/api/v1/health/live`)).status, 200);
  const readiness = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(readiness.status, 503);
  const readinessPayload = await readiness.json();
  assert.equal(readinessPayload.database.status, 'down');
  assert.equal(readinessPayload.database.schemaVerified, false);
  assert.equal(
    JSON.stringify(readinessPayload).includes(isolatedDirectory),
    false,
  );

  assert.equal((await fetch(`${baseUrl}/docs`)).status, 200);
  const openApiResponse = await fetch(`${baseUrl}/docs/openapi.json`);
  assert.equal(openApiResponse.status, 200);
  const openApi = await openApiResponse.json();
  assert.equal(openApi.info.version, metadata.apiVersion);
  assert.equal(
    openApi.paths['/api/v1/meta/version'].get.operationId,
    'getApiContractVersion',
  );

  const output = resolve(apiRoot, '../../docs/api/openapi.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(openApi, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        runtime: 'compiled Nest application; no replaced providers',
        metadata,
        status: {
          version: 200,
          liveness: 200,
          readinessWithoutDatabase: 503,
          docs: 200,
        },
        openApiPaths: Object.keys(openApi.paths),
        openApiArtifact: 'docs/api/openapi.json',
      },
      null,
      2,
    ),
  );
} finally {
  await app?.close();
  process.chdir(previousCwd);
  await rm(isolatedDirectory, { recursive: true, force: true });
}
