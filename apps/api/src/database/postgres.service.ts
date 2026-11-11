import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

export interface DatabasePingResult {
  ok: boolean;
  schema: string;
  latencyMs: number;
}

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly schema: string;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {
    this.schema = this.configService.get<string>('DB_SCHEMA', 'sigeh');
  }

  getSchema(): string {
    return this.schema;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const msg =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        this.logger.error(`Error al ejecutar ROLLBACK transaccional: ${msg}`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<DatabasePingResult> {
    const startedAt = performance.now();
    const result = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const ok = result.rows[0]?.ok === 1;

    return {
      ok,
      schema: this.schema,
      latencyMs,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
