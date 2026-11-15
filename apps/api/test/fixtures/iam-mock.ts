// TEST ONLY. No runtime memory persistence; production uses PgAuthTransaction.
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { IamService } from '../../src/modules/iam/application/iam.service.js';
import { IamSettings } from '../../src/modules/iam/domain/iam-settings.js';
import {
  type AuthTransaction,
  type Credential,
  type Refresh,
  type Session,
  type SecurityEvent,
} from '../../src/modules/iam/domain/session-model.js';
import { type IamRepository } from '../../src/modules/iam/infrastructure/iam.repository.js';
import { type AccessRepository } from '../../src/modules/iam/infrastructure/access.repository.js';
import { type PasswordHasher } from '../../src/modules/iam/domain/password-hasher.js';

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '99999999-9999-4999-8999-999999999999';
export function iamFixture() {
  let now = new Date();
  let tail: Promise<unknown> = Promise.resolve();
  const secret = randomBytes(48).toString('base64url');
  const settings = new IamSettings(
    new ConfigService({
      IAM_V2_ENABLED: 'true',
      JWT_SECRET: secret,
      IAM_JWT_ISSUER: 'urn:sigeh:test',
      IAM_JWT_AUDIENCE: 'sigeh-test',
    }),
  );
  const credential: Credential = {
    usuario_id: USER,
    activo: true,
    algoritmo: 'ARGON2ID',
    password_hash: 'TEST_ONLY_HASH_NOT_A_CREDENTIAL',
    requiere_cambio: false,
    intentos_fallidos: 0,
    bloqueada_hasta: null,
  };
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, Refresh>();
  const audits: SecurityEvent[] = [];
  const attempts = new Map<string, number>();
  const operations: string[] = [];
  const tx: AuthTransaction = {
    now: async () => now,
    attempt: async (key, max) => {
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      return n <= max;
    },
    credential: async (identifier) =>
      identifier === 'cuenta_ficticia' ? credential : null,
    credentialAttempt: async (_id, ok, date, max, seconds) => {
      credential.intentos_fallidos = ok ? 0 : credential.intentos_fallidos + 1;
      credential.bloqueada_hasta =
        !ok && credential.intentos_fallidos >= max
          ? new Date(date.getTime() + seconds * 1000)
          : null;
    },
    userActive: async (id) => id === USER && credential.activo,
    createSession: async (s) => {
      sessions.set(s.sesion_id, { ...s });
    },
    findRefresh: async (hash) => {
      operations.push('find');
      return tokens.get(hash) ?? null;
    },
    lockSession: async (id) => {
      operations.push('lock');
      return sessions.get(id) ?? null;
    },
    consumeRefresh: async (id, replacement, date) => {
      operations.push('consume');
      const t = [...tokens.values()].find((v) => v.token_id === id)!;
      t.consumido_en = date;
      void replacement;
    },
    insertRefresh: async (id, session, hash, expires) => {
      operations.push('insert');
      tokens.set(hash, {
        token_id: id,
        sesion_id: session,
        expira_en: expires,
        consumido_en: null,
        revocado_en: null,
      });
    },
    touchSession: async (id, date, idle) => {
      const s = sessions.get(id)!;
      s.ultima_actividad_en = date;
      s.inactiva_en = idle;
    },
    revoke: async (id, _reason, date) => {
      const s = sessions.get(id);
      if (s) s.revocada_en = date;
      for (const t of tokens.values())
        if (t.sesion_id === id) t.revocado_en = date;
    },
    audit: async (e) => {
      audits.push(e);
    },
  };
  const repository = {
    transaction: <T>(work: (t: AuthTransaction) => Promise<T>): Promise<T> => {
      // Simulates serialized transactions; does not prove PostgreSQL lock behavior.
      const pending = tail.then(() => work(tx));
      tail = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    activeSession: vi.fn(async (p: { usuarioId: string; sesionId: string }) => {
      const s = sessions.get(p.sesionId);
      return Boolean(
        s &&
        s.usuario_id === p.usuarioId &&
        credential.activo &&
        !s.revocada_en &&
        s.expira_en > now &&
        s.inactiva_en > now,
      );
    }),
    sessions: async (id: string) =>
      [...sessions.values()].filter((s) => s.usuario_id === id),
  };
  const passwords = { verify: vi.fn(async () => true) };
  const access = {
    assignments: vi.fn(async () => []),
    scopeExists: vi.fn(async () => true),
  };
  const jwt = new JwtService();
  const service = new IamService(
    settings,
    passwords as unknown as PasswordHasher,
    jwt,
    repository as unknown as IamRepository,
    access as unknown as AccessRepository,
  );
  return {
    service,
    settings,
    jwt,
    secret,
    repository,
    passwords,
    access,
    sessions,
    tokens,
    credential,
    audits,
    attempts,
    operations,
    tx,
    setNow: (value: Date) => {
      now = value;
    },
    password: randomBytes(24).toString('base64url'),
  };
}
