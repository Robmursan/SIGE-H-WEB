import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validBaseEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_USER: 'sigeh_admin',
    DB_PASSWORD: 'test_password_placeholder',
    DB_NAME: 'sigeh_db',
    DB_SCHEMA: 'sigeh',
  };

  it('valida correctamente la configuración mínima y aplica valores por defecto', () => {
    const result = validateEnv(validBaseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.DB_HOST).toBe('127.0.0.1');
    expect(result.DB_PORT).toBe(5432);
    expect(result.DB_USER).toBe('sigeh_admin');
    expect(result.DB_NAME).toBe('sigeh_db');
    expect(result.DB_SCHEMA).toBe('sigeh');
    expect(result.DB_POOL_MAX).toBe(10);
    expect(result.SWAGGER_ENABLED).toBe('true');
  });

  it('lanza error cuando faltan credenciales o nombre de base de datos requeridos', () => {
    expect(() =>
      validateEnv({
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
      }),
    ).toThrow(/DB_USER.*DB_PASSWORD.*DB_NAME/);
  });

  it('lanza error cuando DB_PORT está fuera del rango TCP válido', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DB_PORT: '70000',
      }),
    ).toThrow(/DB_PORT/);
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
