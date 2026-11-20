import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No .env, PG* overrides, preload hooks, or administrative credential inheritance.
if (process.env.DB_PASSWORD || process.env.DATABASE_URL) {
  process.stderr.write(
    'QA_CREDENTIAL_SOURCE_REJECTED: use external DB_PASSWORD_FILE\n',
  );
  process.exit(1);
}
const env = {};
for (const key of [
  'PATH',
  'LANG',
  'TZ',
  'PORT',
  'NODE_ENV',
  'JWT_SECRET',
  'JWT_EXPIRATION',
  'SWAGGER_ENABLED',
  'DB_PASSWORD_FILE',
  'DB_POOL_MAX',
  'DB_CONNECT_TIMEOUT_MS',
  'DB_STATEMENT_TIMEOUT_MS',
  'DB_LOCK_TIMEOUT_MS',
  'DB_IDLE_IN_TX_TIMEOUT_MS',
  'DB_QUERY_TIMEOUT_MS',
  'IAM_V2_ENABLED',
  'L3A_READS_ENABLED',
  'ASISTENCIA_ENABLED',
  'IAM_JWT_ISSUER',
  'IAM_JWT_AUDIENCE',
  'IAM_ACCESS_SECONDS',
  'IAM_ABSOLUTE_SECONDS',
  'IAM_IDLE_SECONDS',
  'IAM_ACCOUNT_ATTEMPTS',
  'IAM_IP_ATTEMPTS',
  'IAM_ATTEMPT_WINDOW_SECONDS',
  'IAM_PASSWORD_MIN_LENGTH',
  'IAM_PASSWORD_MAX_LENGTH',
  'IAM_ARGON_MEMORY_KIB',
  'IAM_ARGON_PASSES',
  'IAM_HASH_CONCURRENCY',
]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
for (const [key, fallback] of Object.entries({
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_USER: 'sigeh_qa_app',
  DB_NAME: 'sigeh_qa',
  DB_SCHEMA: 'sigeh',
})) {
  env[key] = process.env[key] ?? fallback;
}
const cwd = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd,
  env,
  stdio: 'inherit',
});
child.on('error', () => {
  process.stderr.write('QA_START_FAILED\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
