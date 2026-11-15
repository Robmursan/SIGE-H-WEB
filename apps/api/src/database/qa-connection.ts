import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_TARGET = Object.freeze({
  DB_HOST: '127.0.0.1',
  DB_PORT: 55432,
  DB_NAME: 'sigeh_qa',
  DB_USER: 'sigeh_qa_app',
  DB_SCHEMA: 'sigeh',
});
export const QA_PASSWORD_FILE = resolve(
  homedir(),
  '.config/sigeh/qa-app/password',
);

/** Reject a wrong destination before reading any credential or constructing Pool. */
export function assertQaTarget(config: Record<string, unknown>): void {
  for (const [key, expected] of Object.entries(QA_TARGET)) {
    const actual = key === 'DB_PORT' ? Number(config[key]) : config[key];
    if (actual !== expected) throw new Error(`QA_TARGET_REJECTED: ${key}`);
  }
  if (config.DB_PASSWORD || config.DATABASE_URL) {
    throw new Error('QA_CREDENTIAL_SOURCE_REJECTED: use DB_PASSWORD_FILE');
  }
}

/** Never copy the secret into ConfigService, process.env, an error or a log. */
export function readQaPassword(path: string): string {
  let fd: number | undefined;
  try {
    const repository = resolve(
      fileURLToPath(new URL('../../../../', import.meta.url)),
    );
    const absolute = resolve(path);
    if (
      !isAbsolute(path) ||
      absolute === repository ||
      absolute.startsWith(repository + sep) ||
      realpathSync(absolute) !== absolute
    )
      throw new Error();
    const parent = lstatSync(dirname(absolute));
    if (
      !parent.isDirectory() ||
      parent.uid !== process.getuid?.() ||
      (parent.mode & 0o7777) !== 0o700
    )
      throw new Error();
    fd = openSync(
      absolute,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const metadata = fstatSync(fd);
    if (
      !metadata.isFile() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o7777) !== 0o600 ||
      metadata.size > 66
    )
      throw new Error();
    const password = readFileSync(fd, 'utf8').replace(/\r?\n$/, '');
    if (!/^[A-Za-z0-9_-]{64}$/.test(password)) throw new Error();
    return password;
  } catch {
    throw new Error('QA_SECRET_FILE_REJECTED');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
