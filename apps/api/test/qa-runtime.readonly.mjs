import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

if (process.env.SIGEH_QA_READONLY !== '1') {
  process.stderr.write('QA_READONLY_OPT_IN_REQUIRED\n');
  process.exit(1);
}
const report = { status: 'FAIL', stage: 'configuration' };
let app;
const hooks = [];
const { Client, Pool } = createRequire(import.meta.url)('pg');
try {
  const { QA_TARGET, assertQaTarget } =
    await import('../dist/database/qa-connection.js');
  const target = { ...QA_TARGET };
  for (const key of Object.keys(target)) {
    if (process.env[key] !== undefined) target[key] = process.env[key];
  }
  assertQaTarget({
    ...target,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  for (const [key, value] of Object.entries(target))
    process.env[key] = String(value);
  process.env.NODE_ENV = 'test';
  process.env.IAM_V2_ENABLED = 'false';
  // Synthetic ephemeral JWT for HTTP contract tests, never persisted or printed.
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  process.env.JWT_EXPIRATION = '15m';
  process.env.SWAGGER_ENABLED = 'true';
  const counters = { sasl: 0, continue: 0, final: 0 };
  for (const [method, key] of [
    ['_handleAuthSASL', 'sasl'],
    ['_handleAuthSASLContinue', 'continue'],
    ['_handleAuthSASLFinal', 'final'],
  ]) {
    const original = Client.prototype[method];
    Client.prototype[method] = function (...args) {
      counters[key]++;
      return Reflect.apply(original, this, args);
    };
    hooks.push(() => {
      Client.prototype[method] = original;
    });
  }
  const { NestFactory } = await import('@nestjs/core');
  const { ConfigService } = await import('@nestjs/config');
  const { AppModule } = await import('../dist/app.module.js');
  const { configureApp } = await import('../dist/main.js');
  const { PG_POOL } = await import('../dist/database/postgres.service.js');
  const { createQaPoolOptions } =
    await import('../dist/database/database.module.js');
  report.stage = 'nest_bootstrap';
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  configureApp(app);
  const pool = app.get(PG_POOL);
  const sent = [];
  const originalQuery = pool.query;
  // Installed before app.init: includes the real startup probe and health queries.
  pool.query = function (statement, ...args) {
    const sql = typeof statement === 'string' ? statement : statement.text;
    assert.match(sql, /^\s*SELECT\b/i);
    sent.push(sql);
    return Reflect.apply(originalQuery, pool, [statement, ...args]);
  };
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  report.stage = 'pool_identity';
  const session = (
    await pool.query(`SELECT current_user AS role,session_user AS login,
    current_database() AS database,current_schema() AS first_schema,
    current_setting('search_path') AS search_path,current_setting('transaction_read_only') AS read_only,
    has_schema_privilege(current_user,'sigeh','USAGE') AS schema_usage,
    inet_client_addr()::text AS client_addr,inet_server_addr()::text AS server_addr,
    s.ssl FROM pg_stat_ssl s WHERE pid=pg_backend_pid()`)
  ).rows[0];
  assert.equal(session.role, 'sigeh_qa_app');
  assert.equal(session.login, 'sigeh_qa_app');
  assert.equal(session.database, 'sigeh_qa');
  assert.equal(session.schema_usage, true);
  assert.equal(session.read_only, 'on');
  assert.deepEqual(
    session.search_path.split(',').map((s) => s.trim()),
    ['pg_catalog', 'sigeh', 'pg_temp'],
  );
  assert.ok(
    counters.sasl >= 1 && counters.continue >= 1 && counters.final >= 1,
  );
  report.connection = session;
  report.scram_positive = { ...counters };
  report.stage = 'health_contract';
  const responses = {};
  for (const path of [
    '/api/v1/health',
    '/api/v1/health/ready',
    '/api/v1/health/live',
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'sige-h-api');
    if (!path.endsWith('/live')) {
      assert.equal(body.database.schema, 'sigeh');
      assert.equal(body.database.schemaVerified, true);
      assert.equal(body.database.status, 'up');
    }
    responses[path] = { status: response.status, body };
  }
  const openapi = await fetch(`http://127.0.0.1:${port}/docs/openapi.json`);
  assert.equal(openapi.status, 200);
  assert.deepEqual(Object.keys((await openapi.json()).paths).sort(), [
    '/api/v1',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/me',
    '/api/v1/auth/refresh',
    '/api/v1/auth/sessions',
    '/api/v1/auth/sessions/{sessionId}',
    '/api/v1/health',
    '/api/v1/health/live',
    '/api/v1/health/ready',
    '/api/v1/meta/version',
  ]);
  report.http = responses;
  report.openapi = 'unchanged_routes';
  report.stage = 'negative_configuration';
  const base = { ...QA_TARGET, DB_PASSWORD_FILE: '/must-not-be-read' };
  const rejected = [];
  for (const change of [
    { DB_USER: 'sigeh_qa_bootstrap' },
    { DB_USER: 'fictitious_wrong_user' },
    { DB_NAME: 'sigeh_db' },
    { DB_PORT: 5432 },
    { DB_HOST: '192.0.2.1' },
  ]) {
    assert.throws(
      () => createQaPoolOptions(new ConfigService({ ...base, ...change })),
      /QA_TARGET_REJECTED/,
    );
    rejected.push(Object.keys(change)[0]);
  }
  report.negative_configuration = {
    rejected_before_secret_or_network: rejected,
  };
  report.stage = 'negative_password';
  const wrongOptions = createQaPoolOptions(app.get(ConfigService));
  let incorrect;
  do {
    incorrect = randomBytes(48).toString('base64url');
  } while (incorrect === wrongOptions.password);
  wrongOptions.password = incorrect;
  const wrong = new Pool(wrongOptions);
  wrong.on('error', () => {});
  let code;
  try {
    await wrong.query('SELECT 1');
  } catch (error) {
    code = error.code;
  } finally {
    await wrong.end();
    wrongOptions.password = undefined;
    incorrect = undefined;
  }
  assert.equal(code, '28P01');
  report.negative_password = code;
  report.stage = 'integrity';
  const integrity = (
    await pool.query(`SELECT
    (SELECT count(*)::int FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r') AS tables,
    (SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace) AS constraints,
    (SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace AND NOT convalidated) AS unvalidated`)
  ).rows[0];
  assert.deepEqual(integrity, { tables: 51, constraints: 261, unvalidated: 0 });
  report.integrity = integrity;
  report.sql = { queries_from_application_pool: sent.length, all_select: true };
  report.status = 'PASS';
  report.stage = 'complete';
} catch {
  // No driver Error/stack/config object: they may contain credentials.
  report.failure = 'QA_READONLY_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  if (app)
    await app.close().catch(() => {
      process.exitCode = 1;
    });
  for (const restore of hooks) restore();
  process.stdout.write(JSON.stringify(report) + '\n');
}
