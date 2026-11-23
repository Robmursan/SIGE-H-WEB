import {
  type CalendarPolicies,
  type CalendarResolution,
  type CalendarSnapshot,
  UNAPPROVED_CALENDAR_POLICIES,
} from './calendar.model.js';
import { localDate } from './calendar-time.js';
export function overlaps(a: string, b: string, c: string, d: string) {
  return Date.parse(a) < Date.parse(d) && Date.parse(c) < Date.parse(b);
}
export class CalendarValidator {
  validate(
    source: CalendarSnapshot,
    resolution: CalendarResolution,
    policies: CalendarPolicies = UNAPPROVED_CALENDAR_POLICIES,
  ): CalendarResolution {
    const result = structuredClone(resolution);
    for (const candidate of result.candidates) {
      const issue = (code: string) => {
        if (
          !result.conflicts.some(
            (i) => i.employeeId === candidate.employeeId && i.code === code,
          )
        )
          result.conflicts.push({ employeeId: candidate.employeeId, code });
      };
      const endDate = localDate(
        new Date(Date.parse(candidate.end) - 1),
        source.zone,
      );
      const contract = source.contracts.find(
        (c) => c.id === candidate.contractId,
      );
      if (!contract || (contract.end !== null && contract.end < endDate))
        issue('CONTRATO_NO_CUBRE_JORNADA');
      if (
        !source.assignments.some(
          (a) =>
            a.contractId === candidate.contractId &&
            a.serviceId === source.serviceId &&
            a.hospitalId === source.hospitalId &&
            a.start <= source.date &&
            (a.end === null || a.end >= endDate),
        )
      )
        issue('ADSCRIPCION_NO_CUBRE_JORNADA');
      if (source.conflictContext !== 'AUTHORIZED_EMPLOYEE_CONTEXT')
        issue('CONTEXTO_GLOBAL_NO_AUTORIZADO');
      for (const existing of source.existing.filter(
        (p) =>
          p.employeeId === candidate.employeeId &&
          ['PROGRAMADA', 'CERRADA'].includes(p.state),
      )) {
        if (
          overlaps(candidate.start, candidate.end, existing.start, existing.end)
        )
          issue('SOLAPE_PROGRAMACION');
        if (policies.minimumRestHours !== null) {
          const gap = Math.max(
            Date.parse(existing.start) - Date.parse(candidate.end),
            Date.parse(candidate.start) - Date.parse(existing.end),
          );
          if (gap < policies.minimumRestHours * 3600000)
            issue('DESCANSO_MINIMO_INSUFICIENTE');
        }
      }
      if (
        policies.minimumRestHours === null ||
        !Number.isFinite(policies.minimumRestHours) ||
        policies.minimumRestHours < 0 ||
        policies.minimumRestHours > 168
      )
        issue('POLITICA_DESCANSO_MINIMO_PENDIENTE');
      if (
        source.closures.some((c) =>
          overlaps(candidate.start, candidate.end, c.start, c.end),
        )
      )
        issue('PERIODO_CERRADO');
      for (const exception of source.exceptions.filter(
        (e) =>
          e.employeeIds.includes(candidate.employeeId) &&
          (e.originalDate === source.date ||
            overlaps(candidate.start, candidate.end, e.start, e.end)) &&
          !['REVOCADO', 'CANCELADO', 'RECHAZADO'].includes(e.state),
      )) {
        if (!exception.applied) issue('EXCEPCION_PENDIENTE_APLICACION');
        else if (!exception.replacementId)
          issue('EXCEPCION_APLICADA_INCONSISTENTE');
        else if (!source.existing.some((p) => p.id === exception.replacementId))
          issue('EXCEPCION_APLICADA_NO_VERIFICABLE');
        else issue('EXCEPCION_APLICADA_NO_REGENERAR');
      }
    }
    // Validate applied exceptions even when an existing/cancelled row suppressed
    // candidate generation. Do not mistake "no new candidates" for integrity.
    const visibleEmployees = new Set([
      ...source.contracts.map((c) => c.employeeId),
      ...result.existing.map((p) => p.employeeId),
    ]);
    for (const exception of source.exceptions) {
      if (!exception.applied) continue;
      const relevant =
        exception.originalDate === source.date ||
        (localDate(new Date(exception.start), source.zone) <= source.date &&
          localDate(new Date(exception.end), source.zone) >= source.date);
      if (!relevant) continue;
      const original = source.existing.find(
        (p) => p.id === exception.originalId,
      );
      const replacement = source.existing.find(
        (p) => p.id === exception.replacementId,
      );
      const consistent =
        original &&
        replacement &&
        ['AUTORIZADO', 'CERRADO'].includes(exception.state) &&
        exception.employeeIds.includes(original.employeeId) &&
        exception.employeeIds.includes(replacement.employeeId);
      const code =
        !exception.replacementId ||
        !['AUTORIZADO', 'CERRADO'].includes(exception.state)
          ? 'EXCEPCION_APLICADA_INCONSISTENTE'
          : 'EXCEPCION_APLICADA_NO_VERIFICABLE';
      if (!consistent)
        for (const employeeId of exception.employeeIds.filter((id) =>
          visibleEmployees.has(id),
        )) {
          if (
            !result.conflicts.some(
              (i) => i.employeeId === employeeId && i.code === code,
            )
          )
            result.conflicts.push({ employeeId, code });
        }
    }
    // Stable ordering makes the same snapshot independent of SQL row ordering.
    result.candidates.sort(
      (a, b) =>
        a.employeeId.localeCompare(b.employeeId) ||
        a.start.localeCompare(b.start),
    );
    for (const list of [result.exclusions, result.conflicts])
      list.sort(
        (a, b) =>
          a.employeeId.localeCompare(b.employeeId) ||
          a.code.localeCompare(b.code),
      );
    result.existing.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }
}
