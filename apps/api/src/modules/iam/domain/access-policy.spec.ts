import { describe, expect, it } from 'vitest';
import {
  assignmentAllows,
  ORGANIZATION_CATALOG_PERMISSION as permission,
  type PersistedAssignment,
} from './access-policy.js';

const hospital = '11111111-1111-4111-8111-111111111111';
const division = '22222222-2222-4222-8222-222222222222';
const service = '33333333-3333-4333-8333-333333333333';
const other = '99999999-9999-4999-8999-999999999999';
function grant(): PersistedAssignment {
  return {
    kind: 'TITULAR',
    mandateFrom: new Date('2026-01-01'),
    mandateUntil: null,
    encargoPermissions: [],
    usuarioActivo: true,
    hospitalActivo: true,
    scope: { hospitalId: hospital, divisionId: division, servicioId: service },
    division: { id: division, hospitalId: hospital, activo: true },
    servicio: {
      id: service,
      hospitalId: hospital,
      divisionId: division,
      activo: true,
    },
    vigenteDesde: new Date('2026-01-01T00:00:00Z'),
    vigenteHasta: null,
    observedAt: new Date('2026-11-11T12:00:00Z'),
    permissions: [permission],
  };
}

describe('Política V1 de ámbitos persistidos (sin autenticación simulada)', () => {
  it('permite el servicio propio y sus encabezados organizativos', () => {
    expect(
      assignmentAllows(
        grant(),
        { hospitalId: hospital, divisionId: division, servicioId: service },
        permission,
      ),
    ).toBe(true);
    expect(
      assignmentAllows(grant(), { hospitalId: hospital }, permission),
    ).toBe(true);
  });
  it.each(['hospitalId', 'divisionId', 'servicioId'] as const)(
    'deniega %s ajeno',
    (field) => {
      expect(
        assignmentAllows(
          grant(),
          { hospitalId: hospital, [field]: other },
          permission,
        ),
      ).toBe(false);
    },
  );
  it.each([
    (g: PersistedAssignment) => {
      g.usuarioActivo = false;
    },
    (g: PersistedAssignment) => {
      g.hospitalActivo = false;
    },
    (g: PersistedAssignment) => {
      g.division!.activo = false;
    },
    (g: PersistedAssignment) => {
      g.servicio!.activo = false;
    },
    (g: PersistedAssignment) => {
      g.permissions = [];
    },
    (g: PersistedAssignment) => {
      g.vigenteDesde = new Date('2027-01-01');
    },
    (g: PersistedAssignment) => {
      g.vigenteHasta = g.observedAt;
    },
    (g: PersistedAssignment) => {
      g.vigenteHasta = new Date('2026-02-01');
    },
    (g: PersistedAssignment) => {
      g.vigenteHasta = new Date('invalid');
    },
    (g: PersistedAssignment) => {
      g.observedAt = new Date('invalid');
    },
    (g: PersistedAssignment) => {
      g.servicio!.hospitalId = other;
    },
    (g: PersistedAssignment) => {
      g.division!.hospitalId = other;
    },
    (g: PersistedAssignment) => {
      g.servicio!.divisionId = other;
    },
    (g: PersistedAssignment) => {
      g.servicio = null;
    },
    (g: PersistedAssignment) => {
      g.division = null;
    },
  ])(
    'deniega cuenta, jerarquía, permiso o vigencia no efectivos (%#)',
    (mutate) => {
      const g = grant();
      mutate(g);
      expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
        false,
      );
    },
  );
  it('un ámbito hospitalario o divisional cubre sus descendientes, sin roles mágicos', () => {
    const g = grant();
    g.scope.servicioId = null;
    g.servicio = null;
    expect(
      assignmentAllows(
        g,
        { hospitalId: hospital, divisionId: division },
        permission,
      ),
    ).toBe(true);
    expect(assignmentAllows(g, { hospitalId: other }, permission)).toBe(false);
    g.scope.divisionId = null;
    g.division = null;
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      true,
    );
    expect(
      assignmentAllows(g, { hospitalId: hospital }, 'COBERTURA_ASIGNAR'),
    ).toBe(false);
  });
  it('deriva división del servicio cuando usuario_roles no fija división', () => {
    const g = grant();
    g.scope.divisionId = null;
    expect(assignmentAllows(g, { divisionId: division }, permission)).toBe(
      true,
    );
    expect(assignmentAllows(g, { divisionId: other }, permission)).toBe(false);
  });
});

describe('Mandatos V2: nunca inferir facultades de encargado', () => {
  it('sin contexto se deniega, incluso con permiso V1 y jerarquía válida', () => {
    const g = grant();
    g.kind = null;
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      false,
    );
  });
  it('encargado exige fin de mandato y permiso explícito adicional', () => {
    const g = grant();
    g.kind = 'ENCARGADO';
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      false,
    );
    g.mandateUntil = new Date('2026-12-01');
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      false,
    );
    g.encargoPermissions = [permission];
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      true,
    );
    g.permissions = [];
    expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
      false,
    );
  });
  it.each(['not-started', 'expired', 'invalid'])(
    'rechaza mandato %s',
    (reason) => {
      const g = grant();
      if (reason === 'not-started') g.mandateFrom = new Date('2027-01-01');
      if (reason === 'expired') g.mandateUntil = g.observedAt;
      if (reason === 'invalid') g.mandateFrom = new Date('invalid');
      expect(assignmentAllows(g, { hospitalId: hospital }, permission)).toBe(
        false,
      );
    },
  );
});
