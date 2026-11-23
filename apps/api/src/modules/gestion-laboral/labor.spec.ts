import { describe, expect, it, vi } from 'vitest';
import { type PoolClient } from 'pg';
import { type PostgresService } from '../../database/postgres.service.js';
import { LaborRepository, serviceScope } from './labor.repository.js';
import {
  calendarDate,
  datePeriod,
  hoursRule,
  instantPeriod,
  sevenDays,
} from './labor.rules.js';
const H = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  C = '33333333-3333-4333-8333-333333333333';
const actor = { usuarioId: H, sesionId: C };
function fake(answers: unknown[][]) {
  const query = vi.fn(async (sql: string, ..._v: unknown[]) =>
    sql.startsWith('SET ') || sql.includes('pg_advisory_xact_lock')
      ? { rows: [] }
      : { rows: answers.shift() ?? [] },
  );
  const tx = vi.fn(
    async (work: (c: PoolClient) => Promise<unknown>, _options: unknown) =>
      work({ query } as unknown as PoolClient),
  );
  return {
    repo: new LaborRepository({
      withTransaction: tx,
    } as unknown as PostgresService),
    query,
    tx,
  };
}
describe('circuito laboral: reglas puras', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-1-01'])(
    'rechaza fecha %s',
    (date) => expect(() => calendarDate(date)).toThrow(),
  );
  it('periodos acotados, vigencia y zona no se improvisan', () => {
    expect(() => datePeriod('2026-11-23', '2026-11-22')).toThrow();
    expect(() =>
      instantPeriod('2026-11-23T00:00:00Z', '2026-11-22T00:00:00Z'),
    ).toThrow();
  });
  it('nocturna es consistente y jornada normal no puede cruzar sin marcarlo', () => {
    expect(() => hoursRule('20:00', '07:30', true)).not.toThrow();
    expect(() => hoursRule('20:00', '07:30', false)).toThrow();
  });
  it('siete días únicos y sin descanso inferido', () => {
    expect(() =>
      sevenDays(Array.from({ length: 7 }, () => ({ diaIso: 1 }))),
    ).toThrow();
    expect(() =>
      sevenDays(Array.from({ length: 7 }, (_, i) => ({ diaIso: i + 1 }))),
    ).not.toThrow();
  });
  it('contradicción ámbito ruta/cuerpo se rechaza', () => {
    expect(() => serviceScope({ hospitalId: H, servicioId: C }, S)).toThrow(
      'inconsistente',
    );
  });
});
describe('circuito laboral con cliente simulado', () => {
  it('configuración no cruza hospital o adscripción vencida y no escribe', async () => {
    for (const answers of [[], [[{}], []], [[{}], [{ employeeId: H }], []]]) {
      const f = fake(answers);
      await expect(
        f.repo.configuration(actor, C, {
          hospitalId: H,
          servicioId: S,
          fecha: '2026-11-24',
        }),
      ).rejects.toThrow();
      expect(f.query.mock.calls.map(([s]) => s).join(' ')).not.toMatch(
        /INSERT|UPDATE|DELETE|FOR UPDATE/,
      );
      expect(f.tx).toHaveBeenCalledWith(expect.any(Function), {
        readOnly: true,
      });
    }
  });
  it('consulta señala patrones solapados/incompletos sin inventar horarios', async () => {
    const f = fake([
      [{}],
      [{ employeeId: H }],
      [{}],
      [
        { activo: true, dias: [], horarioId: null, autorizadoPor: H },
        { activo: false, dias: [], horarioId: null, autorizadoPor: null },
      ],
    ]);
    const r = await f.repo.configuration(actor, C, {
      hospitalId: H,
      servicioId: S,
      fecha: '2026-11-24',
    });
    expect(r.conflictos).toEqual([
      'PATRONES_SOLAPADOS',
      'PATRON_INACTIVO',
      'PATRON_INCOMPLETO',
      'HORARIO_FALTANTE',
      'AUTORIZACION_PATRON_FALTANTE',
    ]);
    expect(r.empleadoId).toBe(H);
    const sql = f.query.mock.calls.map(([s]) => s).join(' ');
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|rud/);
    expect(sql).toContain('a.servicio_id=$3');
  });
  it('distribución cuenta una persona aunque el origen contenga varias filas', async () => {
    const f = fake([
      [{}],
      [
        { rotacionId: C, empleadoId: H },
        { rotacionId: S, empleadoId: H },
      ],
    ]);
    const r = await f.repo.distribution(actor, S, {
      hospitalId: H,
      fecha: '2026-11-24',
      limit: 50,
    });
    expect(r.items).toHaveLength(2);
    expect(r.employeeCountOnPage).toBe(1);
  });
  it('sin facultad no escribe ni cambia contratos', async () => {
    const f = fake([]);
    await expect(
      f.repo.adscription(actor, C, {
        hospitalId: H,
        servicioId: S,
        inicio: '2026-11-23',
        fin: '2026-11-30',
        clase: 'NOMINAL',
      }),
    ).rejects.toThrow('Facultad');
    expect(f.query.mock.calls.map(([s]) => s).join(' ')).not.toMatch(
      /INSERT|UPDATE|DELETE/,
    );
  });
  it('adscripción solapada no borra historia ni la sustituye', async () => {
    const f = fake([[{}], [{}], [{ employeeId: H }], [{}]]);
    await expect(
      f.repo.adscription(actor, C, {
        hospitalId: H,
        servicioId: S,
        inicio: '2026-11-23',
        fin: '2026-11-30',
        clase: 'NOMINAL',
      }),
    ).rejects.toThrow('movimiento formal');
    expect(f.query.mock.calls.map(([s]) => s).join(' ')).not.toContain(
      'INSERT INTO sigeh.adscripciones',
    );
  });
  it('alta de adscripción y auditoría comparten cliente', async () => {
    const f = fake([
      [{}],
      [{}],
      [{ employeeId: H }],
      [],
      [{ adscripcionId: C }],
      [],
    ]);
    await f.repo.adscription(actor, C, {
      hospitalId: H,
      servicioId: S,
      inicio: '2026-11-23',
      fin: '2026-11-30',
      clase: 'NOMINAL',
    });
    const sql = f.query.mock.calls.map(([s]) => s).join(' ');
    expect(sql).toContain('INSERT INTO sigeh.auditoria_general');
    expect(sql).not.toContain('UPDATE sigeh.contratos');
    expect(f.tx).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: false,
    });
  });
  it('rotación de otra subárea/hospital se rechaza', async () => {
    const f = fake([[{}], [{ employeeId: H }], [{}], []]);
    await expect(
      f.repo.rotation(actor, S, {
        hospitalId: H,
        contratoId: C,
        subareaId: C,
        inicio: '2026-11-23',
        fin: '2026-11-30',
      }),
    ).rejects.toThrow('Subárea');
    expect(f.query.mock.calls.map(([s]) => s).join(' ')).not.toContain(
      'INSERT INTO sigeh.rotaciones_subarea',
    );
  });
  it('catálogos solo agregan: no alteran patrones utilizados por otros hospitales', async () => {
    const f = fake([[{}], [{ horarioId: C }], []]);
    await f.repo.createHours(actor, {
      hospitalId: H,
      codigo: 'QA_TEST',
      nombre: 'Horario sintético',
      horaInicio: '20:00',
      horaFin: '07:30',
      cruzaMedianoche: true,
    });
    const sql = f.query.mock.calls.map(([s]) => s).join(' ');
    expect(sql).toContain('INSERT INTO sigeh.horarios');
    expect(sql).not.toMatch(/UPDATE sigeh.horarios|DELETE/);
  });
  it('lectura usa facultad propia, límite y READ ONLY', async () => {
    const f = fake([[{}], []]);
    await f.repo.hours(actor, { hospitalId: H, limit: 50 });
    expect(f.tx).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
    expect(f.query.mock.calls.map(([s]) => s).join(' ')).not.toMatch(
      /INSERT|UPDATE|DELETE/,
    );
  });
  it('patrón sin horario no se asigna', async () => {
    const f = fake([[{}], [{ employeeId: H }], [{ complete: false }]]);
    await expect(
      f.repo.assignPattern(actor, C, {
        hospitalId: H,
        patronId: C,
        inicio: '2026-11-23',
        fin: '2026-11-30',
      }),
    ).rejects.toThrow('incompleto');
  });
});
