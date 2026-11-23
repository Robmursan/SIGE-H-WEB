// Projection of existing V1 facts, not a new assignment model. The caller must
// supply an authorized service snapshot. A rotation is not actual incorporation.
export interface DistributionContract {
  id: string;
  employeeId: string;
  hospitalId: string;
  start: string;
  end: string | null;
  active: boolean;
}
export interface DistributionRotation {
  contractId: string;
  serviceId: string;
  hospitalId: string;
  subareaId: string;
  start: string;
  end: string;
}
export interface DistributionAssignment {
  contractId: string;
  employeeId: string;
  hospitalId: string;
  serviceId: string;
  subareaId: string | null;
  start: string;
  end: string;
  state: string;
}
export function operationalDistribution(
  scope: {
    hospitalId: string;
    serviceId: string;
    date: string;
    instant: string;
  },
  contracts: DistributionContract[],
  rotations: DistributionRotation[],
  assignments: DistributionAssignment[],
) {
  const employees = new Map<
    string,
    {
      employeeId: string;
      rotatedSubareas: Set<string>;
      assignedSubareas: Set<string>;
    }
  >();
  for (const c of contracts) {
    if (
      !c.active ||
      c.hospitalId !== scope.hospitalId ||
      c.start > scope.date ||
      (c.end !== null && c.end < scope.date)
    )
      continue;
    const rotated = rotations.filter(
      (r) =>
        r.contractId === c.id &&
        r.hospitalId === scope.hospitalId &&
        r.serviceId === scope.serviceId &&
        r.start <= scope.date &&
        r.end >= scope.date,
    );
    const assigned = assignments.filter(
      (a) =>
        a.contractId === c.id &&
        a.employeeId === c.employeeId &&
        a.hospitalId === scope.hospitalId &&
        a.serviceId === scope.serviceId &&
        a.state === 'CONFIRMADA' &&
        Date.parse(a.start) <= Date.parse(scope.instant) &&
        Date.parse(a.end) > Date.parse(scope.instant),
    );
    if (!rotated.length && !assigned.length) continue;
    const person = employees.get(c.employeeId) ?? {
      employeeId: c.employeeId,
      rotatedSubareas: new Set<string>(),
      assignedSubareas: new Set<string>(),
    };
    for (const r of rotated) person.rotatedSubareas.add(r.subareaId);
    for (const a of assigned)
      if (a.subareaId) person.assignedSubareas.add(a.subareaId);
    employees.set(c.employeeId, person);
  }
  return [...employees.values()]
    .map((e) => ({
      employeeId: e.employeeId,
      rotatedSubareas: [...e.rotatedSubareas].sort(),
      assignedSubareas: [...e.assignedSubareas].sort(),
      conflict: e.rotatedSubareas.size > 1 || e.assignedSubareas.size > 1,
    }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}
