import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL, PostgresService } from './postgres.service.js';

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
          application_name: 'sigeh-api',
          options: `-c search_path=${schema},public`,
        });

        pool.on('error', (err: Error) => {
          logger.error(
            `Error inesperado en cliente inactivo del pool PostgreSQL: ${err.message}`,
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
