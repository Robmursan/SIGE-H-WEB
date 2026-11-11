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
  validateSync,
} from 'class-validator';

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
  DB_IDLE_TIMEOUT_MS: number = 30000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  DB_CONNECT_TIMEOUT_MS: number = 5000;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED: 'true' | 'false' = 'true';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
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
    SWAGGER_ENABLED: config.SWAGGER_ENABLED ?? 'true',
  };

  const validatedConfig = plainToInstance(EnvironmentVariables, mergedConfig, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((err) => {
        const constraints = err.constraints
          ? Object.values(err.constraints).join(', ')
          : 'invalid value';
        return `${err.property}: ${constraints}`;
      })
      .join('; ');
    throw new Error(`Configuración de variables de entorno inválida: ${details}`);
  }

  return validatedConfig;
}
