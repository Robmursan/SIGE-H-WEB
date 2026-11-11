import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validBaseEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_USER: 'sigeh_admin',
    DB_PASSWORD: 'test_password_local_only',
    DB_NAME: 'sigeh_db',
    DB_SCHEMA: 'sigeh',
    JWT_SECRET: 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6',
    JWT_EXPIRATION: '8h',
  };

  it('valida correctamente la configuración mínima y aplica valores por defecto de timeouts y JWT', () => {
    const result = validateEnv(validBaseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.DB_HOST).toBe('127.0.0.1');
    expect(result.DB_PORT).toBe(5432);
    expect(result.DB_USER).toBe('sigeh_admin');
    expect(result.DB_NAME).toBe('sigeh_db');
    expect(result.DB_SCHEMA).toBe('sigeh');
    expect(result.DB_POOL_MAX).toBe(10);
    expect(result.DB_STATEMENT_TIMEOUT_MS).toBe(15000);
    expect(result.DB_LOCK_TIMEOUT_MS).toBe(5000);
    expect(result.DB_IDLE_IN_TX_TIMEOUT_MS).toBe(30000);
    expect(result.DB_QUERY_TIMEOUT_MS).toBe(15000);
    expect(result.SWAGGER_ENABLED).toBe('true');
    expect(result.JWT_EXPIRATION).toBe('8h');
  });

  it('lanza error cuando faltan credenciales de BD o JWT_SECRET', () => {
    expect(() =>
      validateEnv({
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
      }),
    ).toThrow(/DB_USER.*DB_PASSWORD.*DB_NAME.*JWT_SECRET/);
  });

  it('lanza error cuando JWT_SECRET tiene menos de 32 caracteres', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_SECRET: 'secreto_demasiado_corto_123',
      }),
    ).toThrow(/JWT_SECRET must be at least 32 characters long/);
  });

  it('lanza error cuando JWT_SECRET usa un valor predeterminado o de ejemplo (.env.example / dev)', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_SECRET: 'REEMPLAZAR_SECRET_JWT_EN_ENTORNO_LOCAL_MIN_32_CARACTERES',
      }),
    ).toThrow(/JWT_SECRET.*forbidden/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_SECRET: 'sigeh_jwt_secret_dev_2026_inseguro_por_defecto',
      }),
    ).toThrow(/JWT_SECRET.*forbidden/);
  });

  it('lanza error cuando JWT_EXPIRATION tiene un formato inválido', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_EXPIRATION: 'invalid-duration',
      }),
    ).toThrow(/JWT_EXPIRATION/);
  });

  it('lanza error cuando DB_PORT o timeouts SQL están fuera de rango', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DB_PORT: '70000',
      }),
    ).toThrow(/DB_PORT/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DB_STATEMENT_TIMEOUT_MS: '100',
      }),
    ).toThrow(/DB_STATEMENT_TIMEOUT_MS/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DB_LOCK_TIMEOUT_MS: '100',
      }),
    ).toThrow(/DB_LOCK_TIMEOUT_MS/);
  });

  it('lanza error cuando DB_SCHEMA contiene caracteres SQL inválidos', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DB_SCHEMA: 'sigeh; DROP SCHEMA public;--',
      }),
    ).toThrow(/DB_SCHEMA/);
  });
});
