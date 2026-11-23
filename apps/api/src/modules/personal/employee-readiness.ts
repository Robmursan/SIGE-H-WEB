import {
  type CalendarSnapshot,
  validOn,
} from '../calendario/calendar.model.js';
// Labor configuration only: neither actual presence nor effective coverage.
// No names, RUD or cross-hospital destination IDs are returned.
export function employeeReadiness(source: CalendarSnapshot) {
  return [...new Set(source.contracts.map((c) => c.employeeId))]
    .sort()
    .map((employeeId) => {
      const contracts = source.contracts.filter(
        (c) =>
          c.employeeId === employeeId &&
          c.hospitalId === source.hospitalId &&
          c.activeEmployee &&
          c.state === 'ACTIVO' &&
          validOn(c.start, c.end, source.date),
      );
      const ids = new Set(contracts.map((c) => c.id));
      const assignments = source.assignments.filter(
        (a) => ids.has(a.contractId) && validOn(a.start, a.end, source.date),
      );
      const patterns = source.patterns.filter(
        (p) =>
          ids.has(p.contractId) &&
          p.active &&
          validOn(p.start, p.end, source.date),
      );
      const issues: string[] = [];
      if (!contracts.length) issues.push('SIN_CONTRATO_VIGENTE');
      if (contracts.length > 1) issues.push('CONTRATOS_SIMULTANEOS');
      if (
        !assignments.some(
          (a) =>
            a.serviceId === source.serviceId &&
            a.hospitalId === source.hospitalId,
        )
      )
        issues.push('SIN_ADSCRIPCION_VIGENTE');
      if (
        assignments.some(
          (a) =>
            a.serviceId !== source.serviceId ||
            a.hospitalId !== source.hospitalId,
        )
      )
        issues.push('ADSCRIPCIONES_INCOMPATIBLES');
      if (patterns.length !== 1)
        issues.push(patterns.length ? 'PATRONES_SUPERPUESTOS' : 'SIN_PATRON');
      if (patterns.some((p) => !p.schedule)) issues.push('HORARIO_NO_DEFINIDO');
      if (
        patterns.some(
          (p) =>
            p.days.length !== 7 || new Set(p.days.map((d) => d.iso)).size !== 7,
        )
      )
        issues.push('PATRON_INCOMPLETO');
      return {
        employeeId,
        nominalAdscription: assignments.some(
          (a) => a.kind === 'NOMINAL' && a.serviceId === source.serviceId,
        ),
        operativeAdscription: assignments.some(
          (a) => a.kind === 'OPERATIVA' && a.serviceId === source.serviceId,
        ),
        issues,
      };
    });
}
