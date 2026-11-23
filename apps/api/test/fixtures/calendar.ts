import { type CalendarSnapshot } from '../../src/modules/calendario/calendar.model.js';
export const H = '11111111-1111-4111-8111-111111111111',
  D = '22222222-2222-4222-8222-222222222222',
  S = '33333333-3333-4333-8333-333333333333',
  E = '44444444-4444-4444-8444-444444444444',
  C = '55555555-5555-4555-8555-555555555555',
  OTHER = '99999999-9999-4999-8999-999999999999';
export function calendarFixture(): CalendarSnapshot {
  return {
    conflictContext: 'AUTHORIZED_EMPLOYEE_CONTEXT',
    hospitalId: H,
    serviceId: S,
    divisionId: D,
    zone: 'America/Mexico_City',
    date: '2026-11-21',
    contracts: [
      {
        id: C,
        employeeId: E,
        hospitalId: H,
        activeEmployee: true,
        state: 'ACTIVO',
        type: 'BASE',
        start: '2026-01-01',
        end: null,
      },
    ],
    assignments: [
      {
        id: OTHER,
        contractId: C,
        serviceId: S,
        hospitalId: H,
        kind: 'NOMINAL',
        start: '2026-01-01',
        end: null,
      },
    ],
    patterns: [
      {
        id: OTHER,
        contractId: C,
        start: '2026-01-01',
        end: null,
        active: true,
        kind: 'ORDINARIO',
        days: Array.from({ length: 7 }, (_, i) => ({
          iso: i + 1,
          kind: 'TRABAJO',
        })),
        schedule: {
          id: OTHER,
          start: '07:00:00',
          end: '14:30:00',
          overnight: false,
        },
      },
    ],
    existing: [],
    holidays: [],
    exceptions: [],
    closures: [],
  };
}
