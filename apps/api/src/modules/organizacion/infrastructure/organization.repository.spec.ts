import { describe, expect, it, vi } from 'vitest';
import { OrganizationRepository } from './organization.repository.js';
import { parseOrganizationQuery } from '../dto/organization-query.dto.js';

describe('Adapter ORG: parámetros y frontera de datos (no integración PostgreSQL)', () => {
  it.each(['hospitales', 'divisiones', 'servicios', 'subareas'] as const)(
    'consulta %s con identidad, permiso y ámbito parametrizados',
    async (catalog) => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const repository = new OrganizationRepository({ query } as never);
      const h = '11111111-1111-4111-8111-111111111111';
      const s = '33333333-3333-4333-8333-333333333333';
      const input =
        catalog === 'hospitales'
          ? {}
          : {
              hospitalId: h,
              ...(catalog === 'subareas' ? { servicioId: s } : {}),
            };
      await repository.list(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        catalog,
        parseOrganizationQuery(input, catalog),
      );
      const [text, parameters] = query.mock.calls[0] as [string, unknown[]];
      expect(parameters.slice(0, 2)).toEqual([
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'CATALOGOS_ADMINISTRAR',
      ]);
      expect(text).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(text).not.toContain(h);
      expect(text).toContain('CURRENT_TIMESTAMP');
      expect(text).toContain('sigeh.usuario_roles');
      expect(text).toContain('sigeh.rol_permisos');
      expect(text).toContain('authorized_scopes');
      expect(parameters).toHaveLength(7);
    },
  );
  it('mapea exclusivamente el DTO público de catálogo y no propaga columnas extra', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'id',
          clave: 'QA',
          nombre: 'Hospital QA',
          hospital_id: 'id',
          division_id: null,
          servicio_id: null,
          zona_horaria: 'America/Mexico_City',
          extra: 'private',
        },
      ],
    });
    const repository = new OrganizationRepository({ query } as never);
    const result = await repository.list(
      'actor',
      'hospitales',
      parseOrganizationQuery({}, 'hospitales'),
    );
    expect(Object.keys(result[0]).sort()).toEqual([
      'clave',
      'divisionId',
      'hospitalId',
      'id',
      'nombre',
      'servicioId',
      'zonaHoraria',
    ]);
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
