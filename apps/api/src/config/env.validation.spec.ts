import { describe, expect, it } from 'vitest';
import {
  MAX_JWT_EXPIRATION_SECONDS,
  MIN_JWT_EXPIRATION_SECONDS,
  parseJwtExpirationSeconds,
  validateEnv,
} from './env.validation.js';

describe('validateEnv', () => {
  const validBaseEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '55432',
    DB_USER: 'sigeh_qa_app',
    DB_PASSWORD_FILE: '/external/private/qa-password',
    DB_NAME: 'sigeh_qa',
    DB_SCHEMA: 'sigeh',
    JWT_SECRET: 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6',
    JWT_EXPIRATION: '8h',
  };

  it('valida correctamente la configuración mínima y aplica valores por defecto de timeouts y JWT', () => {
    const result = validateEnv(validBaseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.DB_HOST).toBe('127.0.0.1');
    expect(result.DB_PORT).toBe(55432);
    expect(result.DB_USER).toBe('sigeh_qa_app');
    expect(result.DB_NAME).toBe('sigeh_qa');
    expect(result.DB_SCHEMA).toBe('sigeh');
    expect(result.DB_POOL_MAX).toBe(10);
    expect(result.DB_STATEMENT_TIMEOUT_MS).toBe(15000);
    expect(result.DB_LOCK_TIMEOUT_MS).toBe(5000);
    expect(result.DB_IDLE_IN_TX_TIMEOUT_MS).toBe(30000);
    expect(result.DB_QUERY_TIMEOUT_MS).toBe(15000);
    expect(result.SWAGGER_ENABLED).toBe('true');
    expect(result.JWT_EXPIRATION).toBe('8h');
    expect(result.JWT_EXPIRATION_SECONDS).toBe(28800);
  });

  it('acepta valores de JWT_EXPIRATION exactamente en las fronteras mínima (60s/1m) y máxima (12h/43200s)', () => {
    const minResult = validateEnv({
      ...validBaseEnv,
      JWT_EXPIRATION: '60s',
    });
    expect(minResult.JWT_EXPIRATION_SECONDS).toBe(MIN_JWT_EXPIRATION_SECONDS);

    const minMinuteResult = validateEnv({
      ...validBaseEnv,
      JWT_EXPIRATION: '1m',
    });
    expect(minMinuteResult.JWT_EXPIRATION_SECONDS).toBe(60);

    const maxHourResult = validateEnv({
      ...validBaseEnv,
      JWT_EXPIRATION: '12h',
    });
    expect(maxHourResult.JWT_EXPIRATION_SECONDS).toBe(
      MAX_JWT_EXPIRATION_SECONDS,
    );

    const maxSecondResult = validateEnv({
      ...validBaseEnv,
      JWT_EXPIRATION: '43200s',
    });
    expect(maxSecondResult.JWT_EXPIRATION_SECONDS).toBe(43200);
  });

  it('rechaza valores de JWT_EXPIRATION por debajo del mínimo, por encima del máximo, unidades inválidas y desbordamientos numéricos', () => {
    // Debajo de frontera mínima (59s < 60s)
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_EXPIRATION: '59s',
      }),
    ).toThrow(/JWT_EXPIRATION/);

    // Por encima de frontera máxima (43201s > 43200s, 13h > 12h, 1d = 86400s > 43200s, 365d)
    for (const excessive of ['43201s', '721m', '13h', '1d', '365d']) {
      expect(() =>
        validateEnv({
          ...validBaseEnv,
          JWT_EXPIRATION: excessive,
        }),
      ).toThrow(/JWT_EXPIRATION/);
    }

    // Unidades inválidas, cero o negativos
    for (const invalidUnit of [
      'invalid-duration',
      '500ms',
      '2w',
      '1y',
      '0s',
      '-5m',
      '8h ',
    ]) {
      expect(() =>
        validateEnv({
          ...validBaseEnv,
          JWT_EXPIRATION: invalidUnit,
        }),
      ).toThrow(/JWT_EXPIRATION/);
    }

    // Valores enormes y desbordamientos numéricos (overflow > MAX_SAFE_INTEGER)
    for (const overflowValue of [
      '999999999999999999999999999999d',
      '9007199254740993s',
      '100000000000h',
    ]) {
      expect(parseJwtExpirationSeconds(overflowValue)).toBeNull();
      expect(() =>
        validateEnv({
          ...validBaseEnv,
          JWT_EXPIRATION: overflowValue,
        }),
      ).toThrow(/JWT_EXPIRATION/);
    }
  });

  it('lanza error cuando faltan credenciales de BD o JWT_SECRET', () => {
    expect(() =>
      validateEnv({
        DB_HOST: '127.0.0.1',
        DB_PORT: '55432',
      }),
    ).toThrow(/DB_USER.*DB_NAME.*JWT_SECRET/);
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
