import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

export const PG_POOL = Symbol('PG_POOL');

export interface DatabasePingResult {
  ok: boolean;
  schema: string;
  latencyMs: number;
}

export interface DatabaseReadinessResult extends DatabasePingResult {
  schemaVerified: boolean;
}

const FATAL_PG_CODE_PREFIXES = ['08', '57P', 'XX'];

export function sanitizeDbErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? `[code=${(error as { code: string }).code}] `
      : '';

  const sanitized = raw
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
    .replace(/password\s*=\s*[^\s;]+/gi, 'password=[REDACTED]')
    .replace(/([a-zA-Z0-9._-]+):([^@\s/]+)@/g, '$1:[REDACTED]@');

  return `${code}${sanitized}`;
}

function isFatalConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const pgCode =
    'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  if (
    FATAL_PG_CODE_PREFIXES.some((prefix) => pgCode.startsWith(prefix)) ||
    pgCode === 'ECONNRESET' ||
    pgCode === 'EPIPE'
  ) {
    return true;
  }
  return false;
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
    let txStarted = false;
    let discardClient = false;

    try {
      await client.query('BEGIN');
      txStarted = true;
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (isFatalConnectionError(error)) {
        discardClient = true;
      }

      if (!txStarted) {
        discardClient = true;
      } else {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          discardClient = true;
          this.logger.error(
            `Error al ejecutar ROLLBACK transaccional; cliente descartado del pool: ${sanitizeDbErrorMessage(rollbackError)}`,
          );
        }
      }
      throw error;
    } finally {
      if (discardClient) {
        client.release(true);
      } else {
        client.release();
      }
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

  async checkReadiness(): Promise<DatabaseReadinessResult> {
    const startedAt = performance.now();
    const result = await this.pool.query<{
      ok: number;
      schema_exists: boolean;
    }>(
      `SELECT
         1 AS ok,
         EXISTS (
           SELECT 1
           FROM information_schema.schemata
           WHERE schema_name = $1
         ) AS schema_exists`,
      [this.schema],
    );
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const row = result.rows[0];
    const schemaVerified = row?.schema_exists === true;
    const ok = row?.ok === 1 && schemaVerified;

    return {
      ok,
      schema: this.schema,
      schemaVerified,
      latencyMs,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
