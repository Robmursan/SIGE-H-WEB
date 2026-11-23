import { describe, expect, it, vi } from 'vitest';
import { type PoolClient } from 'pg';
import { type PostgresService } from '../../database/postgres.service.js';
import { CalendarSourceRepository } from './calendar-source.repository.js';
import {
  calendarFixture,
  H,
  D,
  S,
  OTHER,
} from '../../../test/fixtures/calendar.js';
function setup(allow = true) {
  const f = calendarFixture();
  const query = vi.fn(async (sql: string, ..._params: unknown[]) => {
    if (sql.includes('CURRENT_TIMESTAMP AS now'))
      return {
        rows: [
          {
            zone: f.zone,
            divisionId: D,
            now: new Date('2026-11-21T02:00:00Z'),
          },
        ],
      };
    if (sql.includes('WITH authorized_scopes'))
      return { rows: allow ? [{}] : [] };
    if (sql.includes('FROM sigeh.contratos c')) return { rows: f.contracts };
    if (sql.includes('FROM sigeh.adscripciones a'))
      return { rows: f.assignments };
    if (sql.includes('FROM sigeh.empleado_patrones ep'))
      return { rows: f.patterns };
    return { rows: [] };
  });
  const transaction = vi.fn(
    async (work: (client: PoolClient) => Promise<unknown>, _options: unknown) =>
      work({ query } as unknown as PoolClient),
  );
  const repo = new CalendarSourceRepository({
    withTransaction: transaction,
  } as unknown as PostgresService);
  return { f, query, transaction, repo };
}
describe('CalendarSourceRepository: sesión SELECT-only simulada', () => {
  it('fija snapshot antes de consultar, autoriza antes de personal y usa mañana local', async () => {
    const t = setup();
    const r = await t.repo.load(
      { usuarioId: H, sesionId: OTHER },
      { hospitalId: H, servicioId: S },
    );
    expect(r.date).toBe('2026-11-21');
    expect(r.contracts).toHaveLength(1);
    expect(t.transaction).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: true,
    });
    const sql = t.query.mock.calls.map(([q]) => q);
    expect(sql[0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    expect(
      sql.findIndex((q) => q.includes('WITH authorized_scopes')),
    ).toBeLessThan(sql.findIndex((q) => q.includes('FROM sigeh.contratos c')));
    expect(sql.join(' ')).not.toMatch(
      /INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE|ALTER/,
    );
    expect(sql.join(' ')).not.toContain('SELECT *');
    expect(sql.join(' ')).not.toMatch(/\brud\b|password|token_hash/i);
  });
  it('sin facultad/mandato/sesión efectiva no lee personal', async () => {
    const t = setup(false);
    await expect(
      t.repo.load(
        { usuarioId: H, sesionId: OTHER },
        { hospitalId: H, servicioId: S },
      ),
    ).rejects.toThrow('Facultad');
    expect(
      t.query.mock.calls.some(([q]) => q.includes('FROM sigeh.contratos c')),
    ).toBe(false);
  });
  it('error SQL de fuentes se sanitiza, no amplía permisos', async () => {
    const t = setup();
    t.query.mockRejectedValueOnce(
      Object.assign(new Error('password internal SQL'), { code: '42501' }),
    );
    await expect(
      t.repo.load(
        { usuarioId: H, sesionId: OTHER },
        { hospitalId: H, servicioId: S },
      ),
    ).rejects.toThrow('Fuentes de calendario no disponibles');
  });
  it('servicio masivo no entrega cálculo truncado', async () => {
    const t = setup();
    t.f.contracts = Array.from({ length: 10001 }, () => t.f.contracts[0]!);
    await expect(
      t.repo.load(
        { usuarioId: H, sesionId: OTHER },
        { hospitalId: H, servicioId: S },
      ),
    ).rejects.toThrow('límite');
  });
});
