import { describe, expect, it } from 'vitest';
import { CalendarResolver } from './calendar-resolver.js';
import { CalendarValidator } from './calendar-validator.js';
import { simulateCalendar } from './calendar-simulation.service.js';
import { localInstant, tomorrow } from './calendar-time.js';
import {
  calendarFixture,
  C,
  E,
  OTHER,
} from '../../../test/fixtures/calendar.js';
import { employeeReadiness } from '../personal/employee-readiness.js';
import { type CalendarSnapshot } from './calendar.model.js';
const approved = { minimumRestHours: 12, holiday: {} };
const resolve = (s: CalendarSnapshot) => new CalendarResolver().resolve(s);
const validate = (s: CalendarSnapshot) =>
  new CalendarValidator().validate(s, resolve(s), approved);
describe('CAL motor puro, sin PostgreSQL', () => {
  it('servicio completo sin seleccionar trabajadores, fuentes inmutadas', () => {
    const s = calendarFixture();
    s.contracts.push({ ...s.contracts[0]!, id: OTHER, employeeId: OTHER });
    s.assignments.push({ ...s.assignments[0]!, contractId: OTHER });
    s.patterns.push({ ...s.patterns[0]!, contractId: OTHER });
    const before = structuredClone(s);
    expect(resolve(s).candidates).toHaveLength(2);
    expect(s).toEqual(before);
  });
  it.each(['DESCANSO', 'NO_PROGRAMADO'] as const)(
    'excluye %s sin ausencia',
    (kind) => {
      const s = calendarFixture();
      s.patterns[0]!.days[5]!.kind = kind;
      expect(resolve(s).candidates).toEqual([]);
      expect(resolve(s).exclusions).toEqual([{ employeeId: E, code: kind }]);
    },
  );
  it.each(['SUSPENDIDO', 'CERRADO'])('excluye contrato %s', (state) => {
    const s = calendarFixture();
    s.contracts[0]!.state = state;
    expect(resolve(s).exclusions[0]!.code).toBe('CONTRATO_NO_VIGENTE');
  });
  it('contrato vencido y empleado inactivo no generan jornada', () => {
    const s = calendarFixture();
    s.contracts[0]!.end = '2026-11-20';
    expect(resolve(s).candidates).toEqual([]);
    s.contracts[0]!.end = null;
    s.contracts[0]!.activeEmployee = false;
    expect(resolve(s).candidates).toEqual([]);
  });
  it('no inventa horario', () => {
    const s = calendarFixture();
    s.patterns[0]!.schedule = null;
    expect(resolve(s).conflicts[0]!.code).toBe('HORARIO_NO_DEFINIDO');
  });
  it('patrón incompleto y superpuesto producen conflictos', () => {
    const s = calendarFixture();
    s.patterns[0]!.days.pop();
    expect(resolve(s).conflicts[0]!.code).toBe('PATRON_INCOMPLETO');
    s.patterns.push(s.patterns[0]!);
    expect(resolve(s).conflicts[0]!.code).toBe('PATRONES_SUPERPUESTOS');
  });
  it('deduplica nominal y operativa al mismo destino', () => {
    const s = calendarFixture();
    s.assignments.push({ ...s.assignments[0]!, kind: 'OPERATIVA' });
    expect(resolve(s).candidates).toHaveLength(1);
    expect(employeeReadiness(s)).toHaveLength(1);
  });
  it('destinos contradictorios y FK simples inconsistentes no se resuelven arbitrariamente', () => {
    const s = calendarFixture();
    s.assignments.push({
      ...s.assignments[0]!,
      serviceId: OTHER,
      hospitalId: OTHER,
    });
    expect(resolve(s).conflicts[0]!.code).toBe('ADSCRIPCIONES_INCOMPATIBLES');
    expect(JSON.stringify(employeeReadiness(s))).not.toContain(OTHER);
  });
  it('contratos simultáneos producen conflicto', () => {
    const s = calendarFixture();
    s.contracts.push({ ...s.contracts[0]!, id: OTHER });
    s.assignments.push({ ...s.assignments[0]!, contractId: OTHER });
    expect(resolve(s).conflicts[0]!.code).toBe('CONTRATOS_SIMULTANEOS');
  });
  it('nocturna atribuida al inicio termina al día siguiente', () => {
    const s = calendarFixture();
    s.patterns[0]!.kind = 'GUARDIA_NOCTURNA';
    Object.assign(s.patterns[0]!.schedule!, {
      start: '20:00:00',
      end: '07:30:00',
      overnight: true,
    });
    const c = resolve(s).candidates[0]!;
    expect(c.start).toBe('2026-11-22T02:00:00.000Z');
    expect(c.end).toBe('2026-11-22T13:30:00.000Z');
  });
  it('jornada acumulada requiere días y horario explícitos', () => {
    const s = calendarFixture();
    s.patterns[0]!.kind = 'JORNADA_ACUMULADA';
    s.patterns[0]!.schedule!.end = '19:00:00';
    expect(resolve(s).candidates[0]!.end).toBe('2026-11-22T01:00:00.000Z');
  });
  it('festivo sin política bloquea; política explícita excluye', () => {
    const s = calendarFixture();
    s.holidays.push({ date: s.date, official: true });
    expect(resolve(s).conflicts[0]!.code).toBe('POLITICA_FESTIVO_PENDIENTE');
    expect(
      new CalendarResolver().resolve(s, {
        minimumRestHours: 12,
        holiday: { BASE: 'DESCANSO' },
      }).exclusions[0]!.code,
    ).toBe('DESCANSO_FESTIVO');
  });
  it.each(['PROGRAMADA', 'CANCELADA', 'SUSTITUIDA', 'CERRADA'] as const)(
    'no recrea ni duplica %s',
    (state) => {
      const s = calendarFixture();
      s.existing.push({
        id: OTHER,
        employeeId: E,
        serviceId: s.serviceId,
        start: '2026-11-21T13:00:00Z',
        end: '2026-11-21T20:30:00Z',
        state,
      });
      expect(resolve(s).candidates).toEqual([]);
      expect(resolve(s).exclusions[0]!.code).toBe(
        'JORNADA_EXISTENTE_NO_RECREAR',
      );
    },
  );
  it('detecta solape y descanso tras nocturna anterior', () => {
    const s = calendarFixture();
    s.existing.push({
      id: OTHER,
      employeeId: E,
      serviceId: s.serviceId,
      start: '2026-11-21T02:00:00Z',
      end: '2026-11-21T13:30:00Z',
      state: 'CERRADA',
    });
    const codes = validate(s).conflicts.map((i) => i.code);
    expect(codes).toContain('SOLAPE_PROGRAMACION');
    expect(codes).toContain('DESCANSO_MINIMO_INSUFICIENTE');
  });
  it('política mínima pendiente impide resultado publicable', () => {
    const r = simulateCalendar(calendarFixture());
    expect(r.publishable).toBe(false);
    expect(r.conflicts[0]!.code).toBe('POLITICA_DESCANSO_MINIMO_PENDIENTE');
  });
  it('detecta periodo cerrado sin reescribirlo', () => {
    const s = calendarFixture();
    s.closures.push({
      start: '2026-11-21T00:00:00Z',
      end: '2026-11-23T00:00:00Z',
    });
    expect(validate(s).conflicts[0]!.code).toBe('PERIODO_CERRADO');
  });
  it('cambio de descanso protege fecha original aunque la nueva sea distinta', () => {
    const s = calendarFixture();
    s.exceptions.push({
      id: OTHER,
      employeeIds: [E],
      applied: false,
      state: 'AUTORIZADO',
      originalId: OTHER,
      replacementId: null,
      originalDate: s.date,
      start: '2026-11-25T13:00:00Z',
      end: '2026-11-25T20:00:00Z',
    });
    expect(validate(s).conflicts.map((i) => i.code)).toContain(
      'EXCEPCION_PENDIENTE_APLICACION',
    );
  });
  it.each([false, true])(
    'sustitución aplicada=%s no se aplica de nuevo',
    (applied) => {
      const s = calendarFixture();
      s.exceptions.push({
        id: OTHER,
        employeeIds: [E],
        applied,
        state: 'AUTORIZADO',
        originalId: OTHER,
        replacementId: null,
        originalDate: null,
        start: '2026-11-21T13:00:00Z',
        end: '2026-11-21T21:00:00Z',
      });
      expect(validate(s).conflicts.map((i) => i.code)).toContain(
        applied
          ? 'EXCEPCION_APLICADA_INCONSISTENTE'
          : 'EXCEPCION_PENDIENTE_APLICACION',
      );
    },
  );
  it('huella incluye fuentes y políticas sin depender del orden SQL', () => {
    const s = calendarFixture();
    s.assignments.push({ ...s.assignments[0]!, id: C });
    const r = simulateCalendar(s, approved);
    s.assignments.reverse();
    s.patterns[0]!.days.reverse();
    expect(simulateCalendar(s, approved).fingerprint).toBe(r.fingerprint);
    s.patterns[0]!.schedule!.end = '15:00:00';
    expect(simulateCalendar(s, approved).fingerprint).not.toBe(r.fingerprint);
    expect(r.businessWrites).toBe(false);
    expect(Object.keys(r)).not.toContain('asistencia');
  });
  it('mañana usa zona hospitalaria', () => {
    expect(
      tomorrow(new Date('2026-11-21T02:00:00Z'), 'America/Mexico_City'),
    ).toBe('2026-11-21');
  });
  it('rechaza horas locales ambiguas o inexistentes', () => {
    expect(() =>
      localInstant('2026-11-01', '01:30:00', 'America/New_York'),
    ).toThrow('HORA_LOCAL_AMBIGUA');
    expect(() =>
      localInstant('2026-03-08', '02:30:00', 'America/New_York'),
    ).toThrow('HORA_LOCAL_INEXISTENTE');
  });
  it('diagnóstico identifica configuraciones incompletas sin PII', () => {
    const s = calendarFixture();
    s.patterns[0]!.schedule = null;
    s.patterns[0]!.days.pop();
    const r = employeeReadiness(s);
    expect(r[0]!.issues).toContain('HORARIO_NO_DEFINIDO');
    expect(r[0]!.issues).toContain('PATRON_INCOMPLETO');
    expect(JSON.stringify(r)).not.toMatch(/rud|nombres|asistencia/i);
  });
});

describe('CAL revisión de excepciones sin candidatos', () => {
  it('una jornada cancelada no oculta excepción aplicada inconsistente', () => {
    const s = calendarFixture();
    s.existing.push({
      id: OTHER,
      employeeId: E,
      serviceId: s.serviceId,
      start: '2026-11-21T13:00:00Z',
      end: '2026-11-21T20:30:00Z',
      state: 'CANCELADA',
    });
    s.exceptions.push({
      id: OTHER,
      employeeIds: [E],
      applied: true,
      state: 'REVOCADO',
      originalId: OTHER,
      replacementId: null,
      originalDate: s.date,
      start: '2026-11-21T13:00:00Z',
      end: '2026-11-21T20:30:00Z',
    });
    const r = simulateCalendar(s, approved);
    expect(r.candidates).toEqual([]);
    expect(r.publishable).toBe(false);
    expect(r.conflicts[0]!.code).toBe('EXCEPCION_APLICADA_INCONSISTENTE');
  });
});

describe('CAL límites de ámbito de la simulación', () => {
  it('un snapshot limitado al servicio no afirma haber descartado conflictos globales', () => {
    const s = calendarFixture();
    s.conflictContext = 'SERVICE_ONLY';
    const r = simulateCalendar(s, approved);
    expect(r.publishable).toBe(false);
    expect(r.conflicts.map((i) => i.code)).toContain(
      'CONTEXTO_GLOBAL_NO_AUTORIZADO',
    );
  });
});

describe('CAL vigencia completa de guardia nocturna', () => {
  it('contrato que termina en la fecha inicial no acredita la porción del día siguiente', () => {
    const s = calendarFixture();
    s.contracts[0]!.end = s.date;
    Object.assign(s.patterns[0]!.schedule!, {
      start: '20:00:00',
      end: '07:30:00',
      overnight: true,
    });
    expect(
      simulateCalendar(s, approved).conflicts.map((i) => i.code),
    ).toContain('CONTRATO_NO_CUBRE_JORNADA');
  });
  it('adscripción que termina antes del fin de guardia produce conflicto', () => {
    const s = calendarFixture();
    s.assignments[0]!.end = s.date;
    Object.assign(s.patterns[0]!.schedule!, {
      start: '20:00:00',
      end: '07:30:00',
      overnight: true,
    });
    expect(
      simulateCalendar(s, approved).conflicts.map((i) => i.code),
    ).toContain('ADSCRIPCION_NO_CUBRE_JORNADA');
  });
});

describe('CAL: incidencias y subárea, sin capturar asistencia', () => {
  it('incidencia capturada es conflicto, nunca vacaciones aprobadas ni ausencia', () => {
    const s = calendarFixture();
    s.incidents = [
      {
        employeeId: E,
        state: 'CAPTURADA',
        nature: 'VACACIONES',
        approved: false,
        affectsAvailability: true,
        start: '2026-11-21T06:00:00.000Z',
        end: '2026-11-22T06:00:00.000Z',
      },
    ];
    const r = simulateCalendar(s, approved);
    expect(r.conflicts.map((i) => i.code)).toContain(
      'INCIDENCIA_PENDIENTE_NO_APLICADA',
    );
    expect(r.exclusions).toEqual([]);
    expect(r.candidates).toHaveLength(1);
  });
  it('validada sin política institucional mantiene bloqueo', () => {
    const s = calendarFixture();
    s.incidents = [
      {
        employeeId: E,
        state: 'AUTORIZADA',
        nature: 'INCAPACIDAD',
        approved: true,
        affectsAvailability: true,
        start: '2026-11-21T06:00:00.000Z',
        end: '2026-11-22T06:00:00.000Z',
      },
    ];
    expect(
      simulateCalendar(s, approved).conflicts.map((i) => i.code),
    ).toContain('POLITICA_INCIDENCIA_PENDIENTE');
    const r = simulateCalendar(s, {
      ...approved,
      excludeAuthorizedFullShiftIncidents: true,
    });
    expect(r.exclusions[0]!.code).toBe('INCIDENCIA_AUTORIZADA');
    expect(r.candidates).toEqual([]);
  });
  it('una rotación real se proyecta, dos simultáneas bloquean y no duplican', () => {
    const s = calendarFixture();
    s.rotations = [
      {
        contractId: C,
        subareaId: OTHER,
        start: '2026-11-01',
        end: '2026-11-30',
      },
    ];
    expect(simulateCalendar(s, approved).candidates[0]!.subareaId).toBe(OTHER);
    s.rotations.push({ ...s.rotations[0]!, subareaId: C });
    expect(simulateCalendar(s, approved).conflicts[0]!.code).toBe(
      'ROTACIONES_SUPERPUESTAS',
    );
    expect(simulateCalendar(s, approved).candidates).toEqual([]);
  });
});
