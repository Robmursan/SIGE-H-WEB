import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';

// Synthetic configuration with a PG_POOL tripwire. No .env or real credential
// is copied into the worktree. PG_POOL is replaced by a tripwire in HTTP tests.
for (const [name, value] of Object.entries({
  NODE_ENV: 'test',
  IAM_V2_ENABLED: 'false',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_NAME: 'sigeh_qa',
  DB_SCHEMA: 'sigeh',
  DB_USER: 'sigeh_qa_app',
  DB_PASSWORD: '',
  DB_PASSWORD_FILE: '/not-used/http-tests/password',
  JWT_SECRET: randomBytes(48).toString('hex'),
  JWT_EXPIRATION: '15m',
  SWAGGER_ENABLED: 'true',
})) {
  vi.stubEnv(name, value);
}
vi.stubEnv('DATABASE_URL', '');
