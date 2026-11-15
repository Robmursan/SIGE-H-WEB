import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig } from 'pg';
import {
  assertQaTarget,
  readQaPassword,
  QA_PASSWORD_FILE,
} from './qa-connection.js';
import { PG_POOL, PostgresService } from './postgres.service.js';

export function createQaPoolOptions(configService: ConfigService): PoolConfig {
  assertQaTarget({
    DB_HOST: configService.get('DB_HOST', '127.0.0.1'),
    DB_PORT: configService.get('DB_PORT', 55432),
    DB_NAME: configService.get('DB_NAME'),
    DB_USER: configService.get('DB_USER'),
    DB_SCHEMA: configService.get('DB_SCHEMA', 'sigeh'),
    DB_PASSWORD: configService.get('DB_PASSWORD'),
    DATABASE_URL: configService.get('DATABASE_URL'),
  });
  const schema = configService.get<string>('DB_SCHEMA', 'sigeh');
  const statementTimeoutMs = Number(
    configService.get<number>('DB_STATEMENT_TIMEOUT_MS', 15000),
  );
  const lockTimeoutMs = Number(
    configService.get<number>('DB_LOCK_TIMEOUT_MS', 5000),
  );
  const idleInTxTimeoutMs = Number(
    configService.get<number>('DB_IDLE_IN_TX_TIMEOUT_MS', 30000),
  );
  const queryTimeoutMs = Number(
    configService.get<number>('DB_QUERY_TIMEOUT_MS', 15000),
  );

  return {
    host: configService.get<string>('DB_HOST', '127.0.0.1'),
    port: Number(configService.get<number>('DB_PORT', 55432)),
    user: configService.getOrThrow<string>('DB_USER'),
    password: readQaPassword(
      configService.get<string>('DB_PASSWORD_FILE', QA_PASSWORD_FILE),
    ),
    database: configService.getOrThrow<string>('DB_NAME'),
    max: Number(configService.get<number>('DB_POOL_MAX', 10)),
    idleTimeoutMillis: Number(
      configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
    ),
    connectionTimeoutMillis: Number(
      configService.get<number>('DB_CONNECT_TIMEOUT_MS', 5000),
    ),
    statement_timeout: statementTimeoutMs,
    lock_timeout: lockTimeoutMs,
    idle_in_transaction_session_timeout: idleInTxTimeoutMs,
    query_timeout: queryTimeoutMs,
    application_name: 'sigeh-api',
    options: `-c search_path=pg_catalog,${schema},pg_temp -c statement_timeout=${statementTimeoutMs} -c lock_timeout=${lockTimeoutMs} -c idle_in_transaction_session_timeout=${idleInTxTimeoutMs}`,
  };
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        const logger = new Logger('DatabaseModule');
        const pool = new Pool(createQaPoolOptions(configService));

        pool.on('error', (err: Error) => {
          logger.error(
            `Error en pool PostgreSQL: ${'code' in err && typeof err.code === 'string' && /^[A-Z0-9]{2,12}$/.test(err.code) ? err.code : 'UNKNOWN'}`,
          );
        });

        return pool;
      },
    },
    PostgresService,
  ],
  exports: [PG_POOL, PostgresService],
})
export class DatabaseModule {}
