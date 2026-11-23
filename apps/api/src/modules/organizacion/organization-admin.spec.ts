import { describe, expect, it, vi } from 'vitest';
import { type PoolClient } from 'pg';
import { type PostgresService } from '../../database/postgres.service.js';
import {
  OrganizationAdminRepository,
  organizationRevision,
} from './organization-admin.repository.js';
import { H, D, S, OTHER } from '../../../test/fixtures/calendar.js';
const actor = { usuarioId: H, sesionId: OTHER };
const row = {
  id: D,
  hospitalId: H,
  clave: 'SINTETICO',
  nombre: 'División de prueba',
  activo: true,
};
function setup(queue: unknown[][]) {
  const query = vi.fn(async (..._args: unknown[]) => ({
    rows: queue.shift() ?? [],
  }));
  const tx = vi.fn(
    async (work: (c: PoolClient) => Promise<unknown>, ..._args: unknown[]) =>
      work({ query } as unknown as PoolClient),
  );
  return {
    repo: new OrganizationAdminRepository({
      withTransaction: tx,
    } as unknown as PostgresService),
    query,
    tx,
  };
}
describe('ORG administrativo con cliente simulado', () => {
  it('alta y auditoría comparten transacción', async () => {
    const f = setup([[], [{}], [row], []]);
    const r = await f.repo.create(actor, 'divisiones', {
      hospitalId: H,
      clave: row.clave,
      nombre: row.nombre,
    });
    expect(r.id).toBe(D);
    expect(f.tx).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: false,
    });
    const sql = f.query.mock.calls.flat().join(' ');
    expect(sql).toContain('INSERT INTO sigeh.divisiones');
    expect(sql).toContain('INSERT INTO sigeh.auditoria_general');
    expect(sql).not.toMatch(/GRANT|REVOKE|DELETE FROM|ALTER TABLE/);
  });
  it('ámbito denegado impide INSERT', async () => {
    const f = setup([[], []]);
    await expect(
      f.repo.create(actor, 'divisiones', {
        hospitalId: H,
        clave: 'X',
        nombre: 'X',
      }),
    ).rejects.toThrow('Facultad');
    expect(f.query.mock.calls.flat().join(' ')).not.toContain('INSERT');
  });
  it('división de otro hospital no alcanza escritura', async () => {
    const f = setup([[], []]);
    await expect(
      f.repo.create(actor, 'servicios', {
        hospitalId: H,
        divisionId: OTHER,
        clave: 'X',
        nombre: 'X',
      }),
    ).rejects.toThrow('División no disponible');
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it('subárea de servicio ajeno no alcanza escritura', async () => {
    const f = setup([[], []]);
    await expect(
      f.repo.create(actor, 'subareas', {
        hospitalId: H,
        servicioId: OTHER,
        clave: 'X',
        nombre: 'X',
      }),
    ).rejects.toThrow('Servicio no disponible');
  });
  it('revisión obsoleta impide UPDATE y auditoría', async () => {
    const f = setup([[], [row], [{}]]);
    await expect(
      f.repo.update(actor, 'divisiones', H, D, {
        revision: '0'.repeat(64),
        nombre: 'Nuevo',
      }),
    ).rejects.toThrow('Revisión obsoleta');
    const sql = f.query.mock.calls.flat().join(' ');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toContain('UPDATE sigeh.');
  });
  it('actualización vacía se rechaza sin transacción', async () => {
    const f = setup([]);
    await expect(
      f.repo.update(actor, 'divisiones', H, D, {
        revision: organizationRevision(row),
      }),
    ).rejects.toThrow('vacía');
    expect(f.tx).not.toHaveBeenCalled();
  });
  it('duplicados son 409 sin detalles SQL', async () => {
    const f = setup([]);
    f.tx.mockRejectedValueOnce(
      Object.assign(new Error('internal'), { code: '23505' }),
    );
    await expect(
      f.repo.create(actor, 'divisiones', {
        hospitalId: H,
        clave: 'X',
        nombre: 'X',
      }),
    ).rejects.toThrow('Código organizacional duplicado');
  });
  it('permisos SQL faltantes no se resuelven con grants', async () => {
    const f = setup([]);
    f.tx.mockRejectedValueOnce(
      Object.assign(new Error('internal'), { code: '42501' }),
    );
    await expect(f.repo.detail(actor, 'servicios', H, S)).rejects.toThrow(
      'Administración no disponible',
    );
  });
  it('detalle solo lectura y revisión estable', async () => {
    const f = setup([[], [row], [{}]]);
    expect((await f.repo.detail(actor, 'divisiones', H, D)).revision).toBe(
      organizationRevision(row),
    );
    expect(f.tx).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
  });
  it('subáreas paginan por ID', async () => {
    const f = setup([
      [],
      [{ division_id: D }],
      [{}],
      [
        { ...row, id: D },
        { ...row, id: OTHER },
      ],
    ]);
    const r = await f.repo.subareas(actor, H, S, { hospitalId: H, limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBe(D);
  });
});

describe('ORG revisión concurrente simulada', () => {
  it('dos actualizaciones con la misma revisión solo confirman una', async () => {
    let current = { ...row };
    let tail: Promise<unknown> = Promise.resolve();
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT division_id AS id'))
        return { rows: [{ ...current }] };
      if (sql.includes('WITH authorized_scopes')) return { rows: [{}] };
      if (sql.startsWith('UPDATE sigeh.divisiones')) {
        current = { ...current, nombre: params![3] as string };
        return { rows: [{ ...current }] };
      }
      return { rows: [] };
    });
    const withTransaction = async <T>(work: (c: PoolClient) => Promise<T>) => {
      const run = tail.then(() => work({ query } as unknown as PoolClient));
      tail = run.catch(() => {});
      return run;
    };
    const repo = new OrganizationAdminRepository({
      withTransaction,
    } as unknown as PostgresService);
    const revision = organizationRevision(current);
    const results = await Promise.allSettled(
      ['A', 'B'].map((nombre) =>
        repo.update(actor, 'divisiones', H, D, { revision, nombre }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.startsWith('UPDATE sigeh.divisiones'),
      ),
    ).toHaveLength(1);
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.startsWith('INSERT INTO sigeh.auditoria_general'),
      ),
    ).toHaveLength(1);
  });
});

describe('ORG error uniforme ante recurso ajeno', () => {
  it('objeto existente sin ámbito no distingue existencia mediante 403/404', async () => {
    const f = setup([[], [row], []]);
    await expect(f.repo.detail(actor, 'divisiones', H, D)).rejects.toThrow(
      'Recurso no disponible',
    );
  });
});
