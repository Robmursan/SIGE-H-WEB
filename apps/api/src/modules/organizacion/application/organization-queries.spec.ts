import { describe, expect, it, vi } from 'vitest';
import { UnavailableIdentityVerifier } from '../../iam/application/identity-verifier.port.js';
import { AccessRepository } from '../../iam/infrastructure/access.repository.js';
import { OrganizationRepository } from '../infrastructure/organization.repository.js';
import { OrganizationQueries } from './organization-queries.js';
import { parseOrganizationQuery } from '../dto/organization-query.dto.js';

describe('Frontera interna de consultas organizativas', () => {
  const query = vi.fn();
  const postgres = { query } as never;
  const access = new AccessRepository(postgres);
  const repository = new OrganizationRepository(postgres);
  const useCase = new OrganizationQueries(
    new UnavailableIdentityVerifier(),
    access,
    repository,
  );

  it('la implementación de identidad actual siempre bloquea antes de SQL', async () => {
    await expect(useCase.list(undefined, 'hospitales', {})).rejects.toThrow(
      'IDENTIDAD_NO_DISPONIBLE',
    );
    await expect(
      useCase.list('unverified-input', 'hospitales', {}),
    ).rejects.toThrow('IDENTIDAD_NO_DISPONIBLE');
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    { hospitalId: 'not-a-uuid' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { usuarioId: '11111111-1111-4111-8111-111111111111' },
    { isAdmin: true },
    { limit: [] },
    { limit: true },
    { limit: null },
    { limit: '0x10' },
    { hospitalId: null },
    { cursor: '1; SELECT' },
  ])('rechaza inputs inválidos/autoridad desde request (%#)', async (input) => {
    await expect(useCase.list(undefined, 'hospitales', input)).rejects.toThrow(
      'CONSULTA_ORG_INVALIDA',
    );
    expect(query).not.toHaveBeenCalled();
  });
  it('normaliza paginación y exige padres para consultas hijas', () => {
    expect(parseOrganizationQuery({ limit: '10' }, 'hospitales').limit).toBe(
      10,
    );
    expect(parseOrganizationQuery({}, 'hospitales').limit).toBe(50);
    expect(() => parseOrganizationQuery({}, 'servicios')).toThrow(
      'CONSULTA_ORG_INVALIDA',
    );
    expect(() =>
      parseOrganizationQuery(
        { hospitalId: '11111111-1111-4111-8111-111111111111' },
        'subareas',
      ),
    ).toThrow('CONSULTA_ORG_INVALIDA');
  });
});
