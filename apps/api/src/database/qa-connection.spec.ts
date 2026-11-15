import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertQaTarget, QA_TARGET, readQaPassword } from './qa-connection.js';
import { createQaPoolOptions } from './database.module.js';

let directory: string;
let file: string;
let synthetic: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'sigeh-qa-config-'));
  chmodSync(directory, 0o700);
  file = join(directory, 'password');
  synthetic = randomBytes(48).toString('base64url');
  writeFileSync(file, synthetic, { mode: 0o600 });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('QA destination and credential boundary (no network)', () => {
  it.each([
    { DB_HOST: 'localhost' },
    { DB_HOST: '192.0.2.1' },
    { DB_PORT: 5432 },
    { DB_NAME: 'sigeh_db' },
    { DB_USER: 'sigeh_qa_bootstrap' },
    { DB_USER: 'incorrect_fictitious_user' },
    { DB_SCHEMA: 'public' },
  ])('rejects unsafe target before reading credential: %j', (change) => {
    expect(() =>
      createQaPoolOptions(
        new ConfigService({
          ...QA_TARGET,
          ...change,
          DB_PASSWORD_FILE: '/must-not-be-read',
        }),
      ),
    ).toThrow(/QA_TARGET_REJECTED/);
  });
  it('rejects inline passwords and connection URLs', () => {
    expect(() =>
      assertQaTarget({ ...QA_TARGET, DB_PASSWORD: synthetic }),
    ).toThrow(/QA_CREDENTIAL_SOURCE_REJECTED/);
    expect(() =>
      assertQaTarget({ ...QA_TARGET, DATABASE_URL: 'forbidden' }),
    ).toThrow(/QA_CREDENTIAL_SOURCE_REJECTED/);
  });
  it('reads only an external private file; Pool receives the secure search_path and existing timeouts', () => {
    const config = new ConfigService({ ...QA_TARGET, DB_PASSWORD_FILE: file });
    const options = createQaPoolOptions(config);
    expect(options.password).toBe(synthetic);
    expect(config.get('DB_PASSWORD')).toBeUndefined();
    expect(options).toMatchObject({
      host: '127.0.0.1',
      port: 55432,
      user: 'sigeh_qa_app',
      database: 'sigeh_qa',
      statement_timeout: 15000,
      lock_timeout: 5000,
      idle_in_transaction_session_timeout: 30000,
    });
    expect(options.options).toContain('search_path=pg_catalog,sigeh,pg_temp');
    expect(options.options).not.toContain('public');
  });
  it.each([0o644, 0o640, 0o400])(
    'rejects file permissions %s without exposing content',
    (mode) => {
      chmodSync(file, mode);
      expect(() => readQaPassword(file)).toThrow(/^QA_SECRET_FILE_REJECTED$/);
    },
  );
  it('rejects open directories, links, repository paths and invalid contents', () => {
    chmodSync(directory, 0o755);
    expect(() => readQaPassword(file)).toThrow(/^QA_SECRET_FILE_REJECTED$/);
    chmodSync(directory, 0o700);
    const link = join(directory, 'link');
    symlinkSync(file, link);
    expect(() => readQaPassword(link)).toThrow(/^QA_SECRET_FILE_REJECTED$/);
    expect(() => readQaPassword(resolve('package.json'))).toThrow(
      /^QA_SECRET_FILE_REJECTED$/,
    );
    writeFileSync(file, 'invalid');
    expect(() => readQaPassword(file)).toThrow(/^QA_SECRET_FILE_REJECTED$/);
  });
  it('rejects a symlink in a parent directory', () => {
    const nested = join(directory, 'private');
    mkdirSync(nested, { mode: 0o700 });
    writeFileSync(join(nested, 'password'), synthetic, { mode: 0o600 });
    symlinkSync(nested, join(directory, 'alias'));
    expect(() => readQaPassword(join(directory, 'alias/password'))).toThrow(
      /^QA_SECRET_FILE_REJECTED$/,
    );
  });
});
