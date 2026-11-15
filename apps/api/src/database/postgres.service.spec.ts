import { ConfigService } from '@nestjs/config';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresService, sanitizeDbErrorMessage } from './postgres.service.js';

describe('PostgresService', () => {
  let service: PostgresService;
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient as unknown as PoolClient),
      end: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('sigeh'),
    };

    service = new PostgresService(
      mockPool as unknown as Pool,
      mockConfigService as unknown as ConfigService,
    );
  });

  it('ejecuta SELECT 1 en ping() y retorna estado ok con esquema sigeh', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });

    const res = await service.ping();

    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 AS ok');
    expect(res.ok).toBe(true);
    expect(res.schema).toBe('sigeh');
    expect(typeof res.latencyMs).toBe('number');
  });

  it('verifica conectividad y existencia del esquema en checkReadiness()', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ ok: 1, schema_exists: true }],
      rowCount: 1,
    });

    const res = await service.checkReadiness();

    expect(res.ok).toBe(true);
    expect(res.schema).toBe('sigeh');
    expect(res.schemaVerified).toBe(true);
  });

  it('ejecuta BEGIN, trabajo y COMMIT verificando command === COMMIT en el mismo PoolClient durante withTransaction()', async () => {
    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null })
      .mockResolvedValueOnce({
        command: 'SELECT',
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ command: 'COMMIT', rows: [], rowCount: null });

    const output = await service.withTransaction(async (client) => {
      await client.query(
        'SELECT 1 FROM sigeh.hospitales WHERE hospital_id = $1',
        ['11111111-1111-4111-8111-111111111111'],
      );
      return 'tx-ok';
    });

    expect(output).toBe('tx-ok');
    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'SELECT 1 FROM sigeh.hospitales WHERE hospital_id = $1',
      ['11111111-1111-4111-8111-111111111111'],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(mockClient.release).toHaveBeenCalledWith();
  });

  it('lanza error y NO reporta éxito cuando el callback captura internamente un error SQL y PostgreSQL devuelve ROLLBACK al ejecutar COMMIT', async () => {
    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null })
      .mockRejectedValueOnce(
        Object.assign(new Error('division by zero'), { code: '22012' }),
      )
      .mockResolvedValueOnce({ command: 'ROLLBACK', rows: [], rowCount: null });

    await expect(
      service.withTransaction(async (client) => {
        try {
          await client.query('SELECT 1 / 0');
        } catch {
          // El callback captura y silencia erróneamente la excepción SQL
        }
        return 'falso-exito';
      }),
    ).rejects.toThrow(
      /Transacción abortada: PostgreSQL devolvió 'ROLLBACK' al ejecutar COMMIT/,
    );

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'SELECT 1 / 0');
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.release).toHaveBeenCalledWith();
  });

  it('descarta el cliente (release(true)), no reintenta escrituras y preserva el error cuando se pierde la conexión durante COMMIT (resultado incierto)', async () => {
    const networkLossOnCommit = Object.assign(
      new Error('Connection terminated unexpectedly during COMMIT'),
      { code: '08006' },
    );

    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null })
      .mockResolvedValueOnce({ command: 'SELECT', rows: [], rowCount: 1 })
      .mockRejectedValueOnce(networkLossOnCommit);

    await expect(
      service.withTransaction(async (client) => {
        await client.query('SELECT 1');
        return 'ok';
      }),
    ).rejects.toThrow('Connection terminated unexpectedly during COMMIT');

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'SELECT 1');
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.release).toHaveBeenCalledWith(true);
  });

  it('ejecuta ROLLBACK y libera el PoolClient normalmente cuando ROLLBACK tiene éxito', async () => {
    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null })
      .mockResolvedValueOnce({ command: 'ROLLBACK', rows: [], rowCount: null });

    await expect(
      service.withTransaction(async () => {
        throw new Error('Fallo de negocio simulado');
      }),
    ).rejects.toThrow('Fallo de negocio simulado');

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledWith();
  });

  it('descarta el PoolClient dañado (release(true)) cuando falla ROLLBACK sin ocultar el error original', async () => {
    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null }) // BEGIN
      .mockRejectedValueOnce(new Error('Conexión perdida durante ROLLBACK')); // ROLLBACK

    await expect(
      service.withTransaction(async () => {
        throw new Error('Error previo en consulta transaccional');
      }),
    ).rejects.toThrow('Error previo en consulta transaccional');

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledWith(true);
  });

  it('descarta el PoolClient dañado (release(true)) cuando ocurre un error fatal de conexión (57P01)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ command: 'BEGIN', rows: [], rowCount: null })
      .mockResolvedValueOnce({ command: 'ROLLBACK', rows: [], rowCount: null });

    const fatalError = Object.assign(
      new Error('terminating connection due to administrator command'),
      { code: '57P01' },
    );

    await expect(
      service.withTransaction(async () => {
        throw fatalError;
      }),
    ).rejects.toThrow('terminating connection due to administrator command');

    expect(mockClient.release).toHaveBeenCalledWith(true);
  });

  it('sanitiza cadenas de conexión y contraseñas en sanitizeDbErrorMessage()', () => {
    const rawError = new Error(
      'Connection failed for postgresql://sigeh_admin:SuperSecret123@127.0.0.1:5432/sigeh_db password=SuperSecret123',
    );
    const sanitized = sanitizeDbErrorMessage(rawError);

    expect(sanitized).not.toContain('SuperSecret123');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('cierra el pool limpiamente en onModuleDestroy()', async () => {
    await service.onModuleDestroy();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });
});

describe('Modos transaccionales explícitos sin DB real', () => {
  it.each([
    [false, 'BEGIN READ WRITE'],
    [true, 'BEGIN READ ONLY'],
  ] as const)('readOnly=%s usa %s', async (readOnly, begin) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ command: 'BEGIN' })
      .mockResolvedValueOnce({ command: 'COMMIT' });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const service = new PostgresService(pool, {
      get: () => 'sigeh',
    } as unknown as ConfigService);
    expect(await service.withTransaction(async () => 'ok', { readOnly })).toBe(
      'ok',
    );
    expect(query.mock.calls.map((c) => c[0])).toEqual([begin, 'COMMIT']);
    expect(client.release).toHaveBeenCalledWith();
  });
});
