import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

function safeTransactionErrorCode(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' && /^[A-Z0-9]{2,12}$/.test(code)
    ? code
    : 'UNKNOWN';
}

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

  /**
   * Ejecuta una unidad de trabajo dentro de una transacción PostgreSQL en el mismo PoolClient.
   *
   * Garantías de integridad transaccional (Sprint 0.2):
   * 1. Verificación explícita de COMMIT: Si el callback captura/silencia un error SQL dentro del
   *    bloque transaccional, PostgreSQL marca la transacción como abortada (`25P02`) y al recibir
   *    `COMMIT` ejecuta internamente un rollback devolviendo `command: 'ROLLBACK'`. Este método
   *    verifica explícitamente que `commitResult.command === 'COMMIT'`; de lo contrario, lanza un
   *    error explícito y nunca reporta éxito falso.
   * 2. Resultado incierto tras enviar COMMIT (`COMMIT_OUTCOME_UNCERTAIN`): Si la conexión se pierde
   *    o falla mientras `COMMIT` está en vuelo, el estado real en el servidor es incierto (la
   *    transacción pudo haberse confirmado o no antes del corte de red). En ese escenario:
   *    - El PoolClient se descarta inmediatamente (`client.release(true)`).
   *    - No se intenta `ROLLBACK` sobre una conexión rota ni se oculta el error original.
   *    - NO se realizan reintentos automáticos de escrituras sin clave de idempotencia y
   *      reconciliación explícita de estado.
   * 3. Preservación de causa raíz: Cualquier fallo durante `ROLLBACK` descarta el cliente del pool
   *    y se registra sanitizado en logs, pero jamás reemplaza ni oculta el error original.
   */
  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
    options?: { readOnly: boolean },
  ): Promise<T> {
    const client = await this.pool.connect();
    let txStarted = false;
    let commitInFlight = false;
    let commitResolvedByServer = false;
    let discardClient = false;

    try {
      const beginResult = await client.query(
        options?.readOnly === false
          ? 'BEGIN READ WRITE'
          : options?.readOnly === true
            ? 'BEGIN READ ONLY'
            : 'BEGIN',
      );
      if (!beginResult || beginResult.command !== 'BEGIN') {
        discardClient = true;
        throw new Error(
          `No se pudo iniciar la transacción PostgreSQL: respuesta inesperada '${beginResult?.command ?? 'UNKNOWN'}' en BEGIN.`,
        );
      }
      txStarted = true;

      const result = await work(client);

      commitInFlight = true;
      const commitResult = await client.query('COMMIT');
      commitInFlight = false;
      commitResolvedByServer = true;

      if (!commitResult || commitResult.command !== 'COMMIT') {
        const actualCommand = commitResult?.command ?? 'UNKNOWN';
        throw new Error(
          `Transacción abortada: PostgreSQL devolvió '${actualCommand}' al ejecutar COMMIT; una consulta previa falló dentro de la transacción y fue silenciada por el callback.`,
        );
      }

      return result;
    } catch (error) {
      if (isFatalConnectionError(error)) {
        discardClient = true;
      }

      if (commitInFlight) {
        discardClient = true;
        this.logger.warn(
          `[COMMIT_OUTCOME_UNCERTAIN] Fallo durante COMMIT transaccional; resultado incierto en PostgreSQL, cliente descartado del pool y sin reintento automático sin idempotencia/reconciliación: ${safeTransactionErrorCode(error)}`,
        );
      } else if (!txStarted) {
        discardClient = true;
      } else if (!commitResolvedByServer) {
        try {
          const rollbackResult = await client.query('ROLLBACK');
          if (!rollbackResult || rollbackResult.command !== 'ROLLBACK') {
            discardClient = true;
          }
        } catch (rollbackError) {
          discardClient = true;
          this.logger.error(
            `Error al ejecutar ROLLBACK transaccional; cliente descartado del pool: ${safeTransactionErrorCode(rollbackError)}`,
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
