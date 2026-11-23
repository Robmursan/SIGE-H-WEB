import { describe, expect, it } from 'vitest';
import { operationalDistribution } from './operational-distribution.js';
import { H, S, C, E, OTHER } from '../../../test/fixtures/calendar.js';
const scope = {
  hospitalId: H,
  serviceId: S,
  date: '2026-11-21',
  instant: '2026-11-21T14:00:00Z',
};
const contract = {
  id: C,
  employeeId: E,
  hospitalId: H,
  start: '2026-01-01',
  end: null,
  active: true,
};
const rotation = {
  contractId: C,
  serviceId: S,
  hospitalId: H,
  subareaId: OTHER,
  start: '2026-11-01',
  end: '2026-11-30',
};
const assignment = {
  contractId: C,
  employeeId: E,
  hospitalId: H,
  serviceId: S,
  subareaId: OTHER,
  start: '2026-11-21T13:00:00Z',
  end: '2026-11-21T20:00:00Z',
  state: 'CONFIRMADA',
};
describe('proyección de distribución, no asistencia ni cobertura', () => {
  it('deduplica personal, separando rotación y asignación confirmada', () => {
    const r = operationalDistribution(
      scope,
      [contract, contract],
      [rotation, rotation],
      [assignment, assignment],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.rotatedSubareas).toEqual([OTHER]);
    expect(r[0]!.assignedSubareas).toEqual([OTHER]);
    expect(r[0]!.conflict).toBe(false);
  });
  it('no incorpora otras instituciones ni asignaciones propuestas', () => {
    expect(
      operationalDistribution(
        scope,
        [contract],
        [{ ...rotation, hospitalId: OTHER }],
        [{ ...assignment, state: 'PROPUESTA' }],
      ),
    ).toEqual([]);
  });
  it('contratos no vigentes y relaciones empleado/contrato falsas se excluyen', () => {
    expect(
      operationalDistribution(
        scope,
        [{ ...contract, end: '2026-11-20' }],
        [rotation],
        [assignment],
      ),
    ).toEqual([]);
    expect(
      operationalDistribution(
        scope,
        [contract],
        [],
        [{ ...assignment, employeeId: OTHER }],
      ),
    ).toEqual([]);
  });
  it('la rotación no es prueba de presencia; destinos simultáneos son conflicto', () => {
    const r = operationalDistribution(
      scope,
      [contract],
      [rotation, { ...rotation, subareaId: C }],
      [],
    );
    expect(r[0]!.assignedSubareas).toEqual([]);
    expect(r[0]!.conflict).toBe(true);
  });
});
