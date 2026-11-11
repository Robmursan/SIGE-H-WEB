import { ConfigService } from '@nestjs/config';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresService } from './postgres.service.js';

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

  it('ejecuta BEGIN, trabajo y COMMIT en el mismo PoolClient durante withTransaction()', async () => {
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const output = await service.withTransaction(async (client) => {
      await client.query('SELECT 1 FROM sigeh.hospitales WHERE hospital_id = $1', [
        '11111111-1111-4111-8111-111111111111',
      ]);
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
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('ejecuta ROLLBACK y libera el PoolClient cuando ocurre un error en withTransaction()', async () => {
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      service.withTransaction(async () => {
        throw new Error('Fallo de negocio simulado');
      }),
    ).rejects.toThrow('Fallo de negocio simulado');

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('cierra el pool limpiamente en onModuleDestroy()', async () => {
    await service.onModuleDestroy();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });
});
