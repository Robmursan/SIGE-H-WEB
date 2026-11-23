import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type Principal } from '../iam/domain/session-model.js';
import { type TargetScope } from '../preparacion/scoped-transaction.js';
import { CalendarSourceRepository } from './calendar-source.repository.js';
import { CalendarResolver } from './calendar-resolver.js';
import { CalendarValidator } from './calendar-validator.js';
import {
  type CalendarPolicies,
  type CalendarSnapshot,
  UNAPPROVED_CALENDAR_POLICIES,
} from './calendar.model.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function simulateCalendar(
  snapshot: CalendarSnapshot,
  policies: CalendarPolicies = UNAPPROVED_CALENDAR_POLICIES,
) {
  const result = new CalendarValidator().validate(
    snapshot,
    new CalendarResolver().resolve(snapshot, policies),
    policies,
  );
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          source: snapshot,
          policies,
          result,
          algorithm: 'cal-simulation-v1',
        }),
      ),
    )
    .digest('hex');
  return {
    ...result,
    summary: {
      candidates: result.candidates.length,
      exclusions: result.exclusions.length,
      conflicts: result.conflicts.length,
      existing: result.existing.length,
    },
    publishable: result.conflicts.length === 0,
    businessWrites: false as const,
    fingerprint,
  };
}
@Injectable()
export class CalendarSimulationService {
  constructor(private readonly source: CalendarSourceRepository) {}
  async simulate(
    actor: Principal,
    scope: TargetScope & { servicioId: string },
  ) {
    return simulateCalendar(await this.source.load(actor, scope));
  }
}
