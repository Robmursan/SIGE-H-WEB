import {
  type CalendarPolicies,
  type CalendarResolution,
  type CalendarSnapshot,
  UNAPPROVED_CALENDAR_POLICIES,
  validOn,
} from './calendar.model.js';
import { localDate, localInstant, plusDay } from './calendar-time.js';

export class CalendarResolver {
  resolve(
    source: CalendarSnapshot,
    policies: CalendarPolicies = UNAPPROVED_CALENDAR_POLICIES,
  ): CalendarResolution {
    const result: CalendarResolution = {
      date: source.date,
      zone: source.zone,
      hospitalId: source.hospitalId,
      serviceId: source.serviceId,
      candidates: [],
      exclusions: [],
      conflicts: [],
      existing: source.existing.filter(
        (p) =>
          p.serviceId === source.serviceId &&
          localDate(new Date(p.start), source.zone) === source.date,
      ),
    };
    const iso = new Date(`${source.date}T12:00:00Z`).getUTCDay() || 7;
    const employees = [
      ...new Set(source.contracts.map((c) => c.employeeId)),
    ].sort();
    for (const employeeId of employees) {
      const issue = (code: string) =>
        result.conflicts.push({ employeeId, code });
      const exclude = (code: string) =>
        result.exclusions.push({ employeeId, code });
      const contracts = source.contracts.filter(
        (c) =>
          c.employeeId === employeeId &&
          c.hospitalId === source.hospitalId &&
          c.activeEmployee &&
          c.state === 'ACTIVO' &&
          validOn(c.start, c.end, source.date),
      );
      if (!contracts.length) {
        exclude('CONTRATO_NO_VIGENTE');
        continue;
      }
      const memberships = contracts.filter((c) =>
        source.assignments.some(
          (a) =>
            a.contractId === c.id &&
            a.serviceId === source.serviceId &&
            a.hospitalId === source.hospitalId &&
            validOn(a.start, a.end, source.date),
        ),
      );
      if (!memberships.length) {
        exclude('SIN_ADSCRIPCION_VIGENTE');
        continue;
      }
      if (memberships.length !== 1) {
        issue('CONTRATOS_SIMULTANEOS');
        continue;
      }
      const contract = memberships[0]!;
      const assignments = source.assignments.filter(
        (a) =>
          a.contractId === contract.id && validOn(a.start, a.end, source.date),
      );
      if (
        assignments.some(
          (a) =>
            a.hospitalId !== source.hospitalId ||
            a.serviceId !== source.serviceId,
        )
      ) {
        issue('ADSCRIPCIONES_INCOMPATIBLES');
        continue;
      }
      // Any historical row on this local start date is a durable stop marker.
      if (
        source.existing.some(
          (p) =>
            p.employeeId === employeeId &&
            localDate(new Date(p.start), source.zone) === source.date,
        )
      ) {
        exclude('JORNADA_EXISTENTE_NO_RECREAR');
        continue;
      }
      const patterns = source.patterns.filter(
        (p) =>
          p.contractId === contract.id &&
          p.active &&
          validOn(p.start, p.end, source.date),
      );
      if (patterns.length !== 1) {
        issue(patterns.length ? 'PATRONES_SUPERPUESTOS' : 'SIN_PATRON');
        continue;
      }
      const pattern = patterns[0]!;
      if (
        pattern.days.length !== 7 ||
        new Set(pattern.days.map((d) => d.iso)).size !== 7 ||
        pattern.days.some(
          (d) =>
            d.iso < 1 ||
            d.iso > 7 ||
            !['TRABAJO', 'DESCANSO', 'NO_PROGRAMADO'].includes(d.kind),
        )
      ) {
        issue('PATRON_INCOMPLETO');
        continue;
      }
      const day = pattern.days.find((d) => d.iso === iso)!;
      if (day.kind !== 'TRABAJO') {
        exclude(day.kind);
        continue;
      }
      if (!pattern.schedule) {
        issue('HORARIO_NO_DEFINIDO');
        continue;
      }
      if (source.holidays.some((h) => h.date === source.date)) {
        const policy = policies.holiday[contract.type];
        if (!policy) {
          issue('POLITICA_FESTIVO_PENDIENTE');
          continue;
        }
        if (policy === 'DESCANSO') {
          exclude('DESCANSO_FESTIVO');
          continue;
        }
      }
      const schedule = pattern.schedule;
      try {
        const start = localInstant(source.date, schedule.start, source.zone);
        const end = localInstant(
          schedule.overnight ? plusDay(source.date) : source.date,
          schedule.end,
          source.zone,
        );
        if (
          end <= start ||
          (schedule.overnight && schedule.end > schedule.start)
        ) {
          issue('HORARIO_INCONSISTENTE');
          continue;
        }
        const rotations = (source.rotations ?? []).filter(
          (r) =>
            r.contractId === contract.id &&
            validOn(r.start, r.end, source.date),
        );
        if (rotations.length > 1) {
          issue('ROTACIONES_SUPERPUESTAS');
          continue;
        }
        const rotation = rotations[0];
        if (
          rotation &&
          localDate(new Date(Date.parse(end) - 1), source.zone) > rotation.end
        ) {
          issue('ROTACION_NO_CUBRE_JORNADA');
          continue;
        }
        const incidents = (source.incidents ?? []).filter(
          (i) =>
            i.employeeId === employeeId &&
            Date.parse(i.start) < Date.parse(end) &&
            Date.parse(i.end) > Date.parse(start) &&
            ['CAPTURADA', 'EN_REVISION', 'AUTORIZADA'].includes(i.state),
        );
        let excluded = false;
        for (const incident of incidents) {
          if (incident.state !== 'AUTORIZADA') {
            issue('INCIDENCIA_PENDIENTE_NO_APLICADA');
            continue;
          }
          if (!incident.approved) {
            issue('AUTORIZACION_INCIDENCIA_NO_ACREDITADA');
            continue;
          }
          if (!incident.affectsAvailability) continue;
          if (!policies.excludeAuthorizedFullShiftIncidents) {
            issue('POLITICA_INCIDENCIA_PENDIENTE');
            continue;
          }
          if (
            Date.parse(incident.start) <= Date.parse(start) &&
            Date.parse(incident.end) >= Date.parse(end)
          ) {
            exclude('INCIDENCIA_AUTORIZADA');
            excluded = true;
          } else issue('INCIDENCIA_PARCIAL_REQUIERE_POLITICA');
        }
        if (excluded) continue;
        result.candidates.push({
          employeeId,
          contractId: contract.id,
          serviceId: source.serviceId,
          scheduleId: schedule.id,
          start,
          end,
          origin: 'PATRON',
          ...(rotation ? { subareaId: rotation.subareaId } : {}),
        });
      } catch (error) {
        issue(error instanceof Error ? error.message : 'HORA_LOCAL_INVALIDA');
      }
    }
    return result;
  }
}
