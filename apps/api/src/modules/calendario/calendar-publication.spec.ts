import { describe, expect, it, vi } from 'vitest';
import { type Pool, type PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PostgresService } from '../../database/postgres.service.js';
import { type CalendarSourceRepository } from './calendar-source.repository.js';
import {
  CalendarPolicyProvider,
  CalendarPublicationService,
} from './calendar-publication.service.js';
import {
  calendarFixture,
  H,
  D,
  S,
  C,
  OTHER,
} from '../../../test/fixtures/calendar.js';
import { simulateCalendar } from './calendar-simulation.service.js';
const actor = { usuarioId: H, sesionId: C },
  scope = { hospitalId: H, divisionId: D, servicioId: S };
const input = {
  fecha: '2026-11-21',
  fingerprint: 'a'.repeat(64),
  policyVersion: 'QA_TEST_ONLY',
  idempotencyKey: OTHER,
};
describe('publicación interna: no ruta ni política por defecto, no PostgreSQL', () => {
  it('proveedor sin aprobación bloquea antes de obtener cliente', async () => {
    const tx = vi.fn();
    const service = new CalendarPublicationService(
      { withTransaction: tx } as unknown as PostgresService,
      {} as CalendarSourceRepository,
      new CalendarPolicyProvider(),
    );
    await expect(service.publish(actor, scope, input)).rejects.toThrow(
      'no aprobada',
    );
    expect(tx).not.toHaveBeenCalled();
  });
  it('cliente UUID o huella inválidos no abren transacción', async () => {
    const tx = vi.fn();
    const service = new CalendarPublicationService(
      { withTransaction: tx } as unknown as PostgresService,
      {} as CalendarSourceRepository,
      new CalendarPolicyProvider(),
    );
    await expect(
      service.publish(actor, scope, { ...input, idempotencyKey: 'wrong' }),
    ).rejects.toThrow('inválida');
    expect(tx).not.toHaveBeenCalled();
  });
  it('persistencia propuesta solo tras revalidar en la misma transacción', async () => {
    const s = calendarFixture(),
      rules = { minimumRestHours: 12, holiday: {} };
    const simulation = simulateCalendar(s, rules);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('WITH authorized_scopes')) return { rows: [{}] };
      if (sql.startsWith('INSERT INTO sigeh.cal_publicaciones'))
        return { rows: [{ id: C }] };
      if (sql.startsWith('INSERT INTO sigeh.programacion_laboral'))
        return { rows: [{ id: OTHER }] };
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient,
      tx = vi.fn(
        async (work: (c: PoolClient) => Promise<unknown>, _options: unknown) =>
          work(client),
      );
    const loadInTransaction = vi.fn(async () => s);
    const service = new CalendarPublicationService(
      { withTransaction: tx } as unknown as PostgresService,
      { loadInTransaction } as unknown as CalendarSourceRepository,
      { current: async () => ({ version: 'QA_TEST_ONLY', rules }) },
    );
    const r = await service.publish(actor, scope, {
      ...input,
      fingerprint: simulation.fingerprint,
    });
    expect(r.replayed).toBe(false);
    expect(loadInTransaction).toHaveBeenCalledWith(client, actor, scope);
    const sql = query.mock.calls.map(([q]) => q).join(' ');
    expect(sql).toContain('ISOLATION LEVEL SERIALIZABLE');
    expect(sql).toContain('INSERT INTO sigeh.cal_publicacion_jornadas');
    expect(sql).toContain('INSERT INTO sigeh.auditoria_general');
    expect(sql).not.toMatch(
      /registros_asistencia|eventos_asistencia|DELETE|UPDATE sigeh.programacion/,
    );
  });
  it('contexto parcial impide INSERT aunque haya política de prueba', async () => {
    const s = calendarFixture();
    s.conflictContext = 'SERVICE_ONLY';
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('WITH authorized_scopes') ? [{}] : [],
    }));
    const tx = async <T>(work: (c: PoolClient) => Promise<T>) =>
      work({ query } as unknown as PoolClient);
    const service = new CalendarPublicationService(
      { withTransaction: tx } as unknown as PostgresService,
      {
        loadInTransaction: async () => s,
      } as unknown as CalendarSourceRepository,
      {
        current: async () => ({
          version: 'QA_TEST_ONLY',
          rules: { minimumRestHours: 12, holiday: {} },
        }),
      },
    );
    await expect(service.publish(actor, scope, input)).rejects.toThrow(
      'contexto global',
    );
    expect(query.mock.calls.map(([q]) => q).join(' ')).not.toContain('INSERT');
  });
});

describe('publicación interna: replay y errores sanitizados', () => {
  it('sin facultad de publicación no lee ledger ni escribe aunque exista política', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const tx = async <T>(work: (c: PoolClient) => Promise<T>) =>
      work({ query } as unknown as PoolClient);
    const service = new CalendarPublicationService(
      { withTransaction: tx } as PostgresService,
      {} as CalendarSourceRepository,
      {
        current: async () => ({
          version: 'QA_TEST_ONLY',
          rules: { minimumRestHours: 12, holiday: {} },
        }),
      },
    );
    await expect(service.publish(actor, scope, input)).rejects.toThrow(
      'Facultad',
    );
    expect(query.mock.calls.flat().join(' ')).not.toMatch(
      /INSERT|cal_publicaciones/,
    );
  });
  it('fallo al auditar exige ROLLBACK del ledger y jornadas; nunca COMMIT ni asistencia', async () => {
    const snapshot = calendarFixture(),
      rules = { minimumRestHours: 12, holiday: {} };
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('INSERT INTO sigeh.auditoria_general'))
        throw Object.assign(new Error('synthetic'), { code: 'XX000' });
      const rows = sql.includes('WITH authorized_scopes')
        ? [{}]
        : sql.startsWith('INSERT INTO sigeh.cal_publicaciones')
          ? [{ id: C }]
          : sql.startsWith('INSERT INTO sigeh.programacion_laboral')
            ? [{ id: OTHER }]
            : [];
      return { command: sql.startsWith('BEGIN') ? 'BEGIN' : sql, rows };
    });
    const release = vi.fn(),
      connect = vi.fn(async () => ({ query, release }));
    const service = new CalendarPublicationService(
      new PostgresService(
        { connect } as unknown as Pool,
        new ConfigService({ DB_SCHEMA: 'sigeh' }),
      ),
      {
        loadInTransaction: async () => snapshot,
      } as unknown as CalendarSourceRepository,
      { current: async () => ({ version: 'QA_TEST_ONLY', rules }) },
    );
    await expect(
      service.publish(actor, scope, {
        ...input,
        fingerprint: simulateCalendar(snapshot, rules).fingerprint,
      }),
    ).rejects.toThrow('reconciliarse');
    const sql = query.mock.calls.map(([s]) => s);
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(sql.join(' ')).not.toMatch(
      /registros_asistencia|eventos_asistencia/,
    );
    expect(connect).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
  it('replay de solicitud ya confirmada no revalida ni publica otra jornada', async () => {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          H,
          S,
          input.fecha,
          input.fingerprint,
          input.policyVersion,
        ]),
      )
      .digest('hex');
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('WITH authorized_scopes')
        ? [{}]
        : sql.startsWith('SELECT publicacion_id')
          ? [{ publicacionId: C, requestHash: hash }]
          : [],
    }));
    const tx = async <T>(work: (c: PoolClient) => Promise<T>) =>
      work({ query } as unknown as PoolClient);
    const load = vi.fn();
    const service = new CalendarPublicationService(
      { withTransaction: tx } as unknown as PostgresService,
      { loadInTransaction: load } as unknown as CalendarSourceRepository,
      {
        current: async () => ({
          version: 'QA_NEW_VERSION',
          rules: { minimumRestHours: 12, holiday: {} },
        }),
      },
    );
    expect(await service.publish(actor, scope, input)).toEqual({
      publicacionId: C,
      replayed: true,
    });
    expect(load).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([s]) => s).join(' ')).not.toContain('INSERT');
  });
});
