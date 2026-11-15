import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { IamRepository, PgAuthTransaction } from './iam.repository.js';
import { type PostgresService } from '../../../database/postgres.service.js';
import { type PoolClient } from 'pg';

describe('Repositorio IAM SQL parametrizado, sin conexión real', () => {
  it('solicita transacción READ WRITE explícita en el mismo cliente', async () => {
    const query = vi.fn(async () => ({ rows: [{ now: new Date() }] }));
    const transaction = vi.fn(
      async (work: (c: PoolClient) => Promise<unknown>) =>
        work({ query } as unknown as PoolClient),
    );
    const repository = new IamRepository({
      withTransaction: transaction,
    } as unknown as PostgresService);
    await repository.transaction((tx) => tx.now());
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: false,
    });
    expect(query).toHaveBeenCalledWith('SELECT clock_timestamp() AS now');
  });
  it('lock de familia, consume condicionado y hashes como parámetros; sin refresh en SQL', async () => {
    const query = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({
      rows: [],
      rowCount: 1,
    }));
    const tx = new PgAuthTransaction({ query } as unknown as PoolClient);
    const id = randomUUID();
    await tx.lockSession(id);
    await tx.consumeRefresh(id, randomUUID(), new Date());
    await tx.insertRefresh(
      randomUUID(),
      id,
      '0'.repeat(64),
      new Date(Date.now() + 60000),
    );
    expect(query.mock.calls[0]![0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1]![0]).toContain('consumido_en IS NULL');
    expect(query.mock.calls[2]![0]).toContain('token_hash');
    expect(
      query.mock.calls.every((call) => !String(call[0]).includes(id)),
    ).toBe(true);
  });
  it('rechaza consumo de refresh que no actualizó exactamente una fila', async () => {
    const tx = new PgAuthTransaction({
      query: vi.fn(async () => ({ rowCount: 0 })),
    } as unknown as PoolClient);
    await expect(
      tx.consumeRefresh(randomUUID(), randomUUID(), new Date()),
    ).rejects.toThrow('REFRESH_STATE_CONFLICT');
  });
});
