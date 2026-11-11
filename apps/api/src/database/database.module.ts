import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  PG_POOL,
  PostgresService,
  sanitizeDbErrorMessage,
} from './postgres.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        const logger = new Logger('DatabaseModule');
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

        const pool = new Pool({
          host: configService.get<string>('DB_HOST', '127.0.0.1'),
          port: Number(configService.get<number>('DB_PORT', 5432)),
          user: configService.getOrThrow<string>('DB_USER'),
          password: configService.getOrThrow<string>('DB_PASSWORD'),
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
          options: `-c search_path=${schema},public -c statement_timeout=${statementTimeoutMs} -c lock_timeout=${lockTimeoutMs} -c idle_in_transaction_session_timeout=${idleInTxTimeoutMs}`,
        });

        pool.on('error', (err: Error) => {
          logger.error(
            `Error inesperado en cliente inactivo del pool PostgreSQL: ${sanitizeDbErrorMessage(err)}`,
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
