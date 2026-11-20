import { describe, expect, it, vi } from 'vitest';
import { OrganizationRepository } from './organization.repository.js';
import { parseOrganizationQuery } from '../dto/organization-query.dto.js';

describe('Referencias ORG con grants existentes', () => {
  it.each(['hospitales', 'divisiones', 'servicios'] as const)(
    'proyecta solo columnas autorizadas en %s',
    async (catalog) => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const repo = new OrganizationRepository({ query } as never);
      const h = '11111111-1111-4111-8111-111111111111';
      const result = await repo.references(
        'actor',
        catalog,
        parseOrganizationQuery(
          catalog === 'hospitales' ? {} : { hospitalId: h },
          catalog,
        ),
      );
      const [text, values] = query.mock.calls[0] as [string, unknown[]];
      expect(text).not.toMatch(/\.(nombre|clave|zona_horaria)\b/);
      expect(text).toContain('authorized_scopes');
      expect(text).toContain(
        'COALESCE(ur.division_id, s.division_id) AS division_id',
      );
      expect(text).not.toContain(h);
      expect(values).toHaveLength(7);
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        limit: 50,
        order: 'id:asc',
      });
    },
  );
  it('pagina con limit+1 y no filtra una columna privada accidental', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'a',
          hospital_id: 'a',
          division_id: null,
          servicio_id: null,
          activo: true,
          private: 'not-public',
        },
        {
          id: 'b',
          hospital_id: 'b',
          division_id: null,
          servicio_id: null,
          activo: true,
        },
      ],
    });
    const result = await new OrganizationRepository({
      query,
    } as never).references(
      'actor',
      'hospitales',
      parseOrganizationQuery({ limit: 1 }, 'hospitales'),
    );
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('a');
    expect(result.items[0]).not.toHaveProperty('private');
    expect(query.mock.calls[0]![1]![6]).toBe(2);
  });
});
