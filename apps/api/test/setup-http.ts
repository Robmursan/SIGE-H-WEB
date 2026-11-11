import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';

// Synthetic, deliberately unreachable configuration. No .env or real credential
// is copied into the worktree. PG_POOL is replaced by a tripwire in HTTP tests.
for (const [name, value] of Object.entries({
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
  DB_NAME: 'sigeh_http_without_db',
  DB_SCHEMA: 'sigeh',
  DB_USER: 'http_without_db',
  DB_PASSWORD: randomBytes(32).toString('hex'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  JWT_EXPIRATION: '15m',
  SWAGGER_ENABLED: 'true',
})) {
  vi.stubEnv(name, value);
}
vi.stubEnv('DATABASE_URL', '');
