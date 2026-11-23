export type DayKind = 'TRABAJO' | 'DESCANSO' | 'NO_PROGRAMADO';
export interface CalendarContract {
  id: string;
  employeeId: string;
  hospitalId: string;
  activeEmployee: boolean;
  state: string;
  type: 'BASE' | 'EVENTUAL' | 'OTRO';
  start: string;
  end: string | null;
}
export interface CalendarAssignment {
  id: string;
  contractId: string;
  serviceId: string;
  hospitalId: string;
  kind: 'NOMINAL' | 'OPERATIVA';
  start: string;
  end: string | null;
}
export interface CalendarPattern {
  id: string;
  contractId: string;
  start: string;
  end: string | null;
  active: boolean;
  kind: string;
  days: { iso: number; kind: DayKind }[];
  schedule: {
    id: string;
    start: string;
    end: string;
    overnight: boolean;
  } | null;
}
export interface CalendarExisting {
  id: string;
  employeeId: string;
  serviceId: string;
  start: string;
  end: string;
  state: 'PROGRAMADA' | 'CANCELADA' | 'SUSTITUIDA' | 'CERRADA';
}
export interface CalendarException {
  id: string;
  employeeIds: string[];
  applied: boolean;
  state: string;
  originalId: string;
  replacementId: string | null;
  originalDate: string | null;
  start: string;
  end: string;
}
export interface CalendarSnapshot {
  conflictContext: 'SERVICE_ONLY' | 'AUTHORIZED_EMPLOYEE_CONTEXT';
  hospitalId: string;
  serviceId: string;
  divisionId: string;
  zone: string;
  date: string;
  contracts: CalendarContract[];
  assignments: CalendarAssignment[];
  patterns: CalendarPattern[];
  existing: CalendarExisting[];
  holidays: { date: string; official: boolean }[];
  exceptions: CalendarException[];
  closures: { start: string; end: string }[];
  rotations?: {
    contractId: string;
    subareaId: string;
    start: string;
    end: string;
  }[];
  incidents?: {
    employeeId: string;
    state: string;
    nature: string;
    approved: boolean;
    affectsAvailability: boolean;
    start: string;
    end: string;
  }[];
}
export interface CalendarPolicies {
  excludeAuthorizedFullShiftIncidents?: boolean;
  minimumRestHours: number | null;
  holiday: Partial<
    Record<CalendarContract['type'], 'TRABAJO_HABITUAL' | 'DESCANSO'>
  >;
}
export interface CalendarIssue {
  employeeId: string;
  code: string;
}
export interface CalendarCandidate {
  subareaId?: string;
  employeeId: string;
  contractId: string;
  serviceId: string;
  scheduleId: string;
  start: string;
  end: string;
  origin: 'PATRON';
}
export interface CalendarResolution {
  date: string;
  zone: string;
  hospitalId: string;
  serviceId: string;
  candidates: CalendarCandidate[];
  exclusions: CalendarIssue[];
  conflicts: CalendarIssue[];
  existing: CalendarExisting[];
}
export const UNAPPROVED_CALENDAR_POLICIES: CalendarPolicies = {
  minimumRestHours: null,
  holiday: {},
};
export function validOn(start: string, end: string | null, date: string) {
  return start <= date && (end === null || end >= date);
}
