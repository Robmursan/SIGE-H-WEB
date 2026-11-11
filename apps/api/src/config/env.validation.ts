import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const FORBIDDEN_JWT_SECRETS = new Set([
  'sigeh_jwt_secret_dev_2026',
  'reemplazar_secret_jwt_en_entorno_local',
  'reemplazar_secret_jwt_en_entorno_local_min_32_caracteres',
  'changeme',
  'secret',
  'jwt_secret',
  'default_jwt_secret',
]);

/**
 * Límites explícitos de expiración para JWT_EXPIRATION (access token):
 * - Mínimo: 60 segundos (1 minuto).
 * - Máximo: 43,200 segundos (12 horas), alineado con la duración máxima de una
 *   jornada hospitalaria/acumulada sin permitir access tokens de varios días o años
 *   ni desbordamientos numéricos (overflow).
 *
 * NOTA ARQUITECTÓNICA (Sprint 0.2):
 * Esta validación sanea exclusivamente la variable de entorno al arranque.
 * La emisión, validación criptográfica de tokens, revocación y guards de autorización
 * pertenecen al módulo IAM (Sprint 1 / migración V2) y NO están implementados aún.
 */
export const MIN_JWT_EXPIRATION_SECONDS = 60;
export const MAX_JWT_EXPIRATION_SECONDS = 43200;

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseJwtExpirationSeconds(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const rawMagnitude = match[1];
  const unit = match[2];

  if (rawMagnitude.length > 10) {
    return null;
  }

  const magnitude = Number(rawMagnitude);
  const multiplier = DURATION_UNIT_SECONDS[unit];

  if (
    !Number.isSafeInteger(magnitude) ||
    magnitude <= 0 ||
    multiplier === undefined
  ) {
    return null;
  }

  const totalSeconds = magnitude * multiplier;
  if (!Number.isSafeInteger(totalSeconds)) {
    return null;
  }

  if (
    totalSeconds < MIN_JWT_EXPIRATION_SECONDS ||
    totalSeconds > MAX_JWT_EXPIRATION_SECONDS
  ) {
    return null;
  }

  return totalSeconds;
}

export function isInsecureJwtSecret(secret: unknown): boolean {
  if (typeof secret !== 'string') {
    return true;
  }
  const normalized = secret.trim().toLowerCase();
  if (normalized.length < 32) {
    return true;
  }
  if (FORBIDDEN_JWT_SECRETS.has(normalized)) {
    return true;
  }
  if (
    normalized.includes('reemplazar_en_entorno_local') ||
    normalized.includes('reemplazar_secret') ||
    normalized.includes('sigeh_jwt_secret_dev') ||
    normalized.includes('placeholder') ||
    normalized.includes('example')
  ) {
    return true;
  }
  return false;
}

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string = '127.0.0.1';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USER!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'DB_SCHEMA must be a valid PostgreSQL identifier',
  })
  DB_SCHEMA: string = 'sigeh';

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_MAX: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(300000)
  DB_IDLE_TIMEOUT_MS: number = 30000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(60000)
  DB_CONNECT_TIMEOUT_MS: number = 5000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  DB_STATEMENT_TIMEOUT_MS: number = 15000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(60000)
  DB_LOCK_TIMEOUT_MS: number = 5000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  DB_IDLE_IN_TX_TIMEOUT_MS: number = 30000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  DB_QUERY_TIMEOUT_MS: number = 15000;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED: 'true' | 'false' = 'true';

  @IsString()
  @IsNotEmpty()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters long',
  })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d*(s|m|h|d)$/, {
    message:
      'JWT_EXPIRATION must be a valid duration string (e.g. 15m, 8h, max 12h / 43200s)',
  })
  JWT_EXPIRATION: string = '8h';

  @Type(() => Number)
  @IsInt()
  @Min(MIN_JWT_EXPIRATION_SECONDS, {
    message: `JWT_EXPIRATION_SECONDS must not be less than ${MIN_JWT_EXPIRATION_SECONDS} seconds (1m)`,
  })
  @Max(MAX_JWT_EXPIRATION_SECONDS, {
    message: `JWT_EXPIRATION_SECONDS must not exceed ${MAX_JWT_EXPIRATION_SECONDS} seconds (12h)`,
  })
  JWT_EXPIRATION_SECONDS: number = 28800;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const rawJwtExpiration = config.JWT_EXPIRATION ?? '8h';
  const parsedJwtExpirationSeconds =
    parseJwtExpirationSeconds(rawJwtExpiration);

  const mergedConfig: Record<string, unknown> = {
    NODE_ENV: config.NODE_ENV ?? 'development',
    PORT: config.PORT ?? 3000,
    DB_HOST: config.DB_HOST ?? '127.0.0.1',
    DB_PORT: config.DB_PORT ?? 5432,
    DB_USER: config.DB_USER,
    DB_PASSWORD: config.DB_PASSWORD,
    DB_NAME: config.DB_NAME,
    DB_SCHEMA: config.DB_SCHEMA ?? 'sigeh',
    DATABASE_URL: config.DATABASE_URL,
    DB_POOL_MAX: config.DB_POOL_MAX ?? 10,
    DB_IDLE_TIMEOUT_MS: config.DB_IDLE_TIMEOUT_MS ?? 30000,
    DB_CONNECT_TIMEOUT_MS: config.DB_CONNECT_TIMEOUT_MS ?? 5000,
    DB_STATEMENT_TIMEOUT_MS: config.DB_STATEMENT_TIMEOUT_MS ?? 15000,
    DB_LOCK_TIMEOUT_MS: config.DB_LOCK_TIMEOUT_MS ?? 5000,
    DB_IDLE_IN_TX_TIMEOUT_MS: config.DB_IDLE_IN_TX_TIMEOUT_MS ?? 30000,
    DB_QUERY_TIMEOUT_MS: config.DB_QUERY_TIMEOUT_MS ?? 15000,
    SWAGGER_ENABLED: config.SWAGGER_ENABLED ?? 'true',
    JWT_SECRET: config.JWT_SECRET,
    JWT_EXPIRATION: rawJwtExpiration,
    JWT_EXPIRATION_SECONDS: parsedJwtExpirationSeconds ?? -1,
  };

  const validatedConfig = plainToInstance(EnvironmentVariables, mergedConfig, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });

  const failureMessages = errors.map((err) => {
    const constraints = err.constraints
      ? Object.values(err.constraints).join(', ')
      : 'invalid value';
    return `${err.property}: ${constraints}`;
  });

  if (parsedJwtExpirationSeconds === null) {
    failureMessages.push(
      `JWT_EXPIRATION: must be a finite duration between ${MIN_JWT_EXPIRATION_SECONDS}s (1m) and ${MAX_JWT_EXPIRATION_SECONDS}s (12h)`,
    );
  }

  if (
    typeof mergedConfig.JWT_SECRET === 'string' &&
    mergedConfig.JWT_SECRET.length >= 32 &&
    isInsecureJwtSecret(mergedConfig.JWT_SECRET)
  ) {
    failureMessages.push(
      'JWT_SECRET: default, example or placeholder JWT_SECRET is forbidden',
    );
  }

  if (failureMessages.length > 0) {
    throw new Error(
      `Configuración de variables de entorno inválida: ${failureMessages.join('; ')}`,
    );
  }

  return validatedConfig;
}
