import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { type Pool } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { OrganizationAdminRepository } from './organization-admin.repository.js';
import { H, D, OTHER } from '../../../test/fixtures/calendar.js';
describe('ORG frontera transaccional real con cliente doble', () => {
  it('fallo de auditoría ordena ROLLBACK, no COMMIT', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('INSERT INTO sigeh.auditoria_general'))
        throw Object.assign(new Error('synthetic failure'), { code: 'XX000' });
      if (sql.startsWith('INSERT INTO sigeh.divisiones'))
        return {
          command: 'INSERT',
          rows: [
            {
              id: D,
              hospitalId: H,
              clave: 'X',
              nombre: 'Sintético',
              activo: true,
            },
          ],
        };
      if (sql.includes('WITH authorized_scopes'))
        return { command: 'SELECT', rows: [{}] };
      return { command: sql.startsWith('BEGIN') ? 'BEGIN' : sql, rows: [] };
    });
    const release = vi.fn(),
      connect = vi.fn(async () => ({ query, release }));
    const postgres = new PostgresService(
      { connect } as unknown as Pool,
      new ConfigService({ DB_SCHEMA: 'sigeh' }),
    );
    const repo = new OrganizationAdminRepository(postgres);
    await expect(
      repo.create({ usuarioId: H, sesionId: OTHER }, 'divisiones', {
        hospitalId: H,
        clave: 'X',
        nombre: 'Sintético',
      }),
    ).rejects.toThrow('Administración no disponible');
    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(query.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});
