import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { iamFixture } from '../../../test/fixtures/iam-mock.js';
import {
  ReadReadinessGuard,
  ReadService,
  READ_PERMISSIONS,
} from './read.service.js';
import { ReadRepository } from './read.repository.js';
import {
  StaffReadQueryDto,
  ScheduleReadQueryDto,
  ReadWindowDto,
  validateReadQuery,
} from './read.dto.js';
import * as sql from './read.sql.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  D = '33333333-3333-4333-8333-333333333333',
  OTHER = '99999999-9999-4999-8999-999999999999';
const query = () =>
  Object.assign(new StaffReadQueryDto(), {
    hospitalId: H,
    servicioId: S,
    fecha: '2026-11-16',
  });
describe('L3A: autorización real de política, sin PostgreSQL', () => {
  function fixture() {
    const f = iamFixture();
    f.access.assignments.mockResolvedValue([
      {
        kind: 'TITULAR',
        mandateFrom: new Date('2026-01-01'),
        mandateUntil: null,
        encargoPermissions: [],
        usuarioActivo: true,
        hospitalActivo: true,
        scope: { hospitalId: H, divisionId: D, servicioId: S },
        division: { id: D, hospitalId: H, activo: true },
        servicio: { id: S, hospitalId: H, divisionId: D, activo: true },
        vigenteDesde: new Date('2026-01-01'),
        vigenteHasta: null,
        observedAt: new Date('2026-11-16'),
        permissions: Object.values(READ_PERMISSIONS),
      },
    ] as never);
    const db = {
      staff: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        limit: 50,
        order: 'id:asc',
      })),
    };
    const service = new ReadService(
      new ReadReadinessGuard(new ConfigService({ L3A_READS_ENABLED: 'true' })),
      f.service,
      db as never,
    );
    return { f, db, service };
  }
  it('default false bloquea antes de SQL incluso si IAM está disponible', () => {
    expect(() =>
      new ReadReadinessGuard(new ConfigService()).requireEnabled(),
    ).toThrow('Lecturas aún no habilitadas');
  });
  it.each([
    { hospitalId: OTHER },
    { servicioId: OTHER },
    { divisionId: OTHER },
  ])('deniega ámbito cruzado antes de consultar datos (%j)', async (change) => {
    const { f, db, service } = fixture();
    const p = {
      usuarioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sesionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    await expect(
      service.staff(p, Object.assign(query(), change)),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.staff).not.toHaveBeenCalled();
    expect(f.audits.at(-1)?.resultado).toBe('DENY');
  });
  it('no infiere facultad por rol/asignación; ausencia de permiso deniega', async () => {
    const { f, db, service } = fixture();
    f.access.assignments.mockResolvedValue([]);
    await expect(
      service.staff({ usuarioId: H, sesionId: S }, query()),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.staff).not.toHaveBeenCalled();
  });
  it('pasa identidad de servidor y facultad explícita al repositorio; audita ALLOW', async () => {
    const { f, db, service } = fixture();
    const p = { usuarioId: H, sesionId: S };
    await service.staff(p, query());
    expect(db.staff).toHaveBeenCalledWith(
      p,
      READ_PERMISSIONS.personal,
      query(),
    );
    expect(f.audits.at(-1)?.resultado).toBe('ALLOW');
  });
});
describe('L3A: consultas estrictas y periodos', () => {
  it.each([
    { hospitalId: undefined },
    { servicioId: undefined },
    { fecha: '2026-02-30' },
    { fecha: '0000-01-01' },
    { limit: 101 },
    { isAdmin: true },
    { hospitalId: null },
    { cursor: 'x' },
  ])('rechaza consulta inválida (%j)', (change) => {
    expect(() =>
      validateReadQuery(Object.assign(query(), change), StaffReadQueryDto),
    ).toThrow();
  });
  it.each([
    { desde: '2026-11-16T00:00:00Z', hasta: '2026-11-24T00:00:00Z' },
    { desde: '2026-11-16T00:00:00Z', hasta: '2026-11-16T00:00:00Z' },
    { desde: '2026-11-16T00:00:00', hasta: '2026-11-17T00:00:00' },
  ])('rechaza ventana no acotada/con zona ausente', (window) => {
    expect(() =>
      validateReadQuery(
        Object.assign(
          new ReadWindowDto(),
          { hospitalId: H, servicioId: S },
          window,
        ),
        ReadWindowDto,
      ),
    ).toThrow();
  });
  it('acepta semana explícita con offset', () => {
    const q = Object.assign(new ScheduleReadQueryDto(), {
      hospitalId: H,
      servicioId: S,
      desde: '2026-11-16T00:00:00-06:00',
      hasta: '2026-11-23T00:00:00-06:00',
    });
    expect(validateReadQuery(q, ScheduleReadQueryDto)).toEqual(q);
  });
});
describe('L3A: SQL parametrizado y minimización (contrato estático, no prueba de RLS)', () => {
  it('no infiere el hospital del empleado o de una FK simple de adscripción', () => {
    for (const text of [
      sql.STAFF_LIST_SQL,
      sql.STAFF_DETAIL_SQL,
      sql.EMPLOYEE_ASSIGNMENTS_SQL,
      sql.CONTRACT_ASSIGNMENTS_SQL,
    ]) {
      expect(text).toContain(
        'c.empleado_id=e.empleado_id AND c.hospital_id=$3::uuid',
      );
      expect(text).toContain(
        'ad.contrato_id=c.contrato_id AND ad.servicio_id=$4::uuid',
      );
    }
    expect(sql.PROGRAM_LIST_SQL).toContain(
      'c.empleado_id=p.empleado_id AND c.hospital_id=p.hospital_id',
    );
  });
  it.each(Object.entries(sql))(
    '%s repite permiso, vigencia y scope en SQL final',
    (_name, text) => {
      expect(text).toContain('authorized_scopes');
      expect(text).toContain('ctx.mandato_desde');
      expect(text).toContain('s.servicio_id=$4::uuid');
      expect(text).toContain('s.hospital_id=$3::uuid');
      expect(text).toContain('a.servicio_id=s.servicio_id');
      expect(text).not.toMatch(
        /\b(rud|segundo_apellido|categoria_id|observaciones|password_hash|salario)\b/,
      );
      expect(text).not.toMatch(/SELECT\s+\w+\.\*/i);
    },
  );
  it('incluye nocturnas solapadas y recorta horas; no calcula asistencia efectiva', () => {
    expect(sql.PROGRAM_LIST_SQL).toContain(
      'p.inicio_programado<$7::timestamptz AND p.fin_programado>$6::timestamptz',
    );
    expect(sql.DASHBOARD_SQL).toContain('LEAST(p.fin_programado');
    expect(sql.DASHBOARD_SQL).not.toContain('registros_asistencia');
  });
  it('no expone columnas extra en DTO y pagina sin duplicar empleados', async () => {
    const db = {
      query: vi.fn(async (_text: string, _params: unknown[]) => ({
        rows: [
          {
            empleado_id: H,
            nombres: 'SINTETICO',
            primer_apellido: 'QA',
            activo: true,
            rud: 'NEVER_RETURN',
          },
          {
            empleado_id: OTHER,
            nombres: 'SINTETICO',
            primer_apellido: 'OTRO',
            activo: true,
          },
        ],
      })),
    };
    const q = Object.assign(query(), { limit: 1 });
    const p = { usuarioId: D, sesionId: S };
    const r = await new ReadRepository(db as never).staff(
      p,
      READ_PERMISSIONS.personal,
      q,
    );
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBe(H);
    expect(r.items[0]).not.toHaveProperty('rud');
    expect(db.query.mock.calls[0]?.[1]).toEqual([
      D,
      READ_PERMISSIONS.personal,
      H,
      S,
      null,
      '2026-11-16',
      null,
      2,
    ]);
  });
  it('detalle invisible es 404 sin leer adscripciones ni revelar existencia', async () => {
    const c = {
      query: vi.fn(async (_text: string, _params: unknown[]) => ({ rows: [] })),
    };
    const db = {
      withTransaction: vi.fn(async (work: (arg: unknown) => unknown) =>
        work(c),
      ),
    };
    await expect(
      new ReadRepository(db as never).detail(
        { usuarioId: H, sesionId: S },
        READ_PERMISSIONS.personal,
        query(),
        OTHER,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(db.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: true,
    });
  });
});
