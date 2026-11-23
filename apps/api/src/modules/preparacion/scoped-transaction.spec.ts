import { describe, expect, it, vi } from 'vitest';
import { type PoolClient } from 'pg';
import {
  requireTransactionScope,
  TITULAR_SCOPES_CTE,
} from './scoped-transaction.js';
import { AUTHORIZED_SCOPES_CTE } from '../iam/infrastructure/authorization-sql.js';
import { H, D, S, OTHER } from '../../../test/fixtures/calendar.js';
describe('autorización SQL dentro de transacción', () => {
  it('TITULAR restringe el grant que lleva la facultad', () => {
    expect(
      TITULAR_SCOPES_CTE.replace(
        "WHERE ctx.tipo='TITULAR' AND ctx.mandato_desde",
        'WHERE ctx.mandato_desde',
      ),
    ).toBe(AUTHORIZED_SCOPES_CTE);
  });
  it('lectura no escribe auditoría y verifica sesión vigente', async () => {
    const query = vi.fn(async (..._args: unknown[]) => ({ rows: [{}] }));
    await requireTransactionScope(
      { query } as unknown as PoolClient,
      { usuarioId: H, sesionId: OTHER },
      'PROGRAMACION_SIMULAR',
      { hospitalId: H, divisionId: D, servicioId: S },
    );
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|GRANT|REVOKE/);
    expect(sql).toContain('se.revocada_en IS NULL');
    expect(sql).toContain('a.division_id=COALESCE($4::uuid,s.division_id)');
    expect(params).toEqual([H, 'PROGRAMACION_SIMULAR', H, D, S, OTHER]);
  });
  it('sin sesión/facultad/ámbito efectivo deniega', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(
      requireTransactionScope(
        { query } as unknown as PoolClient,
        { usuarioId: H, sesionId: OTHER },
        'CATALOGOS_ADMINISTRAR',
        { hospitalId: H },
        true,
      ),
    ).rejects.toThrow('Facultad');
  });
});
