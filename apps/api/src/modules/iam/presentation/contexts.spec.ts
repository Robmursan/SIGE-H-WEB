import { describe, expect, it, vi } from 'vitest';
import { type PoolClient } from 'pg';
import { type PostgresService } from '../../../database/postgres.service.js';
import {
  OWN_CONTEXT_SQL,
  OwnContextsRepository,
} from './contexts.controller.js';
describe('contextos propios: catálogo no implica facultad administrativa', () => {
  it('consulta solo actor/sesión, no enumera descendencia ni exige CATALOGOS_ADMINISTRAR', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const tx = vi.fn(
      async (work: (c: PoolClient) => Promise<unknown>, _options: unknown) =>
        work({ query } as unknown as PoolClient),
    );
    const repo = new OwnContextsRepository({
      withTransaction: tx,
    } as unknown as PostgresService);
    expect(await repo.list({ usuarioId: 'self', sesionId: 'session' })).toEqual(
      [],
    );
    expect(tx).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
    expect(query).toHaveBeenCalledWith(OWN_CONTEXT_SQL, ['self', 'session']);
    expect(OWN_CONTEXT_SQL).not.toContain('CATALOGOS_ADMINISTRAR');
    expect(OWN_CONTEXT_SQL).toContain('s.servicio_id=ur.servicio_id');
    expect(OWN_CONTEXT_SQL).toContain('ctx.mandato_hasta IS NOT NULL');
    expect(OWN_CONTEXT_SQL).not.toMatch(/INSERT|UPDATE|DELETE/);
  });
  it('permisos de encargado son intersección con el rol y mandato vigente', () => {
    expect(OWN_CONTEXT_SQL).toContain('ep.usuario_rol_id=ur.usuario_rol_id');
    expect(OWN_CONTEXT_SQL).toContain('ep.permiso_id=p.permiso_id');
    expect(OWN_CONTEXT_SQL).toContain('ur.vigente_hasta>CURRENT_TIMESTAMP');
    expect(OWN_CONTEXT_SQL).toContain('se.revocada_en IS NULL');
    expect(OWN_CONTEXT_SQL).toContain('s.division_id=ur.division_id');
  });
});
