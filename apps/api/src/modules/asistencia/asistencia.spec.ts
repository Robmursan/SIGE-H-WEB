import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type Pool } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import {
  CapturarAsistenciaDto,
  PaseListaQueryDto,
  strictDto,
} from './asistencia.dto.js';
import {
  AsistenciaRepository,
  type AttendanceRow,
  lockKey,
  commandHash,
  noCaptureReason,
} from './asistencia.repository.js';
import {
  ATTENDANCE_AUTH,
  SESSION_SQL,
  RESOURCE_SQL,
  LIST_SQL,
  CONTEXT_SQL,
  REPLAY_SQL,
  INSERT_SQL,
} from './asistencia.sql.js';
import {
  AttendanceAvailabilityGuard,
  AsistenciaService,
} from './asistencia.service.js';
import { type IamService } from '../iam/application/iam.service.js';
import { type AccessRepository } from '../iam/infrastructure/access.repository.js';
import { type PersistedAssignment } from '../iam/domain/access-policy.js';
const ID = '11111111-1111-4111-8111-111111111111',
  H = '22222222-2222-4222-8222-222222222222';
const p = { usuarioId: ID, sesionId: H },
  body = { estado: 'PRESENTE', expectedRevision: '0' } as const;
const q = { hospitalId: H, servicioId: ID, fecha: '2026-11-22' };
export function row(): AttendanceRow {
  return {
    programacion_id: ID,
    hospital_id: H,
    servicio_id: ID,
    empleado_id: ID,
    nombres: 'Sintético',
    primer_apellido: 'Prueba',
    horario_id: null,
    turno_codigo: null,
    inicio_programado: new Date('2026-11-22T08:00:00Z'),
    fin_programado: new Date('2026-11-22T16:00:00Z'),
    programacion_estado: 'PROGRAMADA',
    asistencia_id: null,
    asistencia_estado: null,
    validacion: null,
    in_window: true,
    contract_active: true,
    closed: false,
    can_capture: true,
    revision: null,
    capture_event_id: null,
    capture_actor_id: null,
    capture_time: null,
  };
}
// Simulates transactional storage and the advisory-lock contract, NOT PostgreSQL itself.
function fixture(
  options: {
    failAudit?: boolean;
    failCommit?: boolean;
    failEvent?: boolean;
  } = {},
) {
  let stored: Record<string, unknown> | null = null,
    event: Record<string, unknown> | null = null,
    active = true,
    visible = true;
  let resource = row(),
    tail = Promise.resolve();
  let onLock = () => {};
  const calls: string[] = [];
  const pool = {
    connect: vi.fn(async () => {
      let releaseLock: (() => void) | undefined,
        snapshot: { stored: typeof stored; event: typeof event } | undefined;
      return {
        release: vi.fn(),
        query: vi.fn(async (sql: string, args: unknown[] = []) => {
          calls.push(sql);
          if (sql === 'BEGIN READ WRITE' || sql === 'BEGIN READ ONLY')
            return { command: 'BEGIN', rows: [] };
          if (sql === 'COMMIT') {
            if (options.failCommit && snapshot)
              throw Object.assign(Error('unavailable'), { code: '08006' });
            releaseLock?.();
            return { command: 'COMMIT', rows: [] };
          }
          if (sql === 'ROLLBACK') {
            if (snapshot) {
              stored = snapshot.stored;
              event = snapshot.event;
            }
            releaseLock?.();
            return { command: 'ROLLBACK', rows: [] };
          }
          if (sql.startsWith('SET ')) return { rows: [] };
          if (sql === SESSION_SQL) return { rows: [{ active }] };
          if (sql === RESOURCE_SQL)
            return {
              rows: visible
                ? [
                    {
                      ...resource,
                      asistencia_id: stored ? H : resource.asistencia_id,
                    },
                  ]
                : [],
            };
          if (sql === CONTEXT_SQL)
            return { rows: [{ zona_horaria: 'America/Mexico_City' }] };
          if (sql === LIST_SQL)
            return {
              rows: [{ ...resource }, { ...resource, programacion_id: H }],
            };
          if (sql.includes('pg_advisory_xact_lock')) {
            const before = tail;
            tail = new Promise<void>((r) => {
              releaseLock = r;
            });
            await before;
            snapshot = { stored, event };
            onLock();
            return { rows: [] };
          }
          if (sql === REPLAY_SQL)
            return {
              rows:
                event &&
                (event.datos as { clientEventId: string }).clientEventId ===
                  args[2]
                  ? [event]
                  : [],
            };
          if (sql === INSERT_SQL) {
            stored = { asistencia_id: H };
            return { rows: [stored] };
          }
          if (sql.includes('INSERT INTO sigeh.eventos_asistencia')) {
            if (options.failEvent) throw Error('event failed');
            event = {
              evento_id: '9007199254740993',
              actor_id: p.usuarioId,
              ocurrido_en: new Date('2026-11-22T10:00:00Z'),
              asistencia_id: H,
              datos: JSON.parse(args[2] as string),
            };
            return { rows: [event] };
          }
          if (sql.includes('INSERT INTO sigeh.auditoria_general')) {
            if (options.failAudit) throw Error('audit failed');
            return { rows: [] };
          }
          throw Error('UNEXPECTED_SQL');
        }),
      };
    }),
  };
  const db = new PostgresService(pool as unknown as Pool, new ConfigService());
  return {
    repo: new AsistenciaRepository(db),
    calls,
    pool,
    get stored() {
      return stored;
    },
    get event() {
      return event;
    },
    onLock: (fn: () => void) => {
      onLock = fn;
    },
    setActive: (v: boolean) => {
      active = v;
    },
    setVisible: (v: boolean) => {
      visible = v;
    },
    setRow: (v: Partial<AttendanceRow>) => {
      resource = { ...resource, ...v };
    },
  };
}
describe('ASI DTOs y reglas de primera captura', () => {
  it('acepta fecha real, cursor y límite acotado', () => {
    expect(strictDto(q, PaseListaQueryDto).limit).toBe(50);
    expect(strictDto({ ...q, limit: '100' }, PaseListaQueryDto).limit).toBe(
      100,
    );
  });
  it.each([
    { fecha: '2026-02-30' },
    { fecha: '0000-01-01' },
    { limit: 101 },
    { limit: 0 },
    { limit: '1.5' },
    { hospitalId: 'x' },
    { horarioId: null },
    { cursor: ['x'] },
    { extra: true },
  ])('rechaza consulta inválida %j', (bad) => {
    expect(() => strictDto({ ...q, ...bad }, PaseListaQueryDto)).toThrow(
      BadRequestException,
    );
  });
  it.each(['PRESENTE', 'AUSENTE', 'PARCIAL'])(
    'admite %s sin validación administrativa',
    (estado) =>
      expect(strictDto({ ...body, estado }, CapturarAsistenciaDto).estado).toBe(
        estado,
      ),
  );
  it.each([
    { estado: 'NO_EXIGIBLE' },
    { estado: 'PENDIENTE' },
    { expectedRevision: 0 },
    { expectedRevision: '1' },
    { actorId: ID },
    { llegada: '2026-11-22T10:00Z' },
    { estado: null },
  ])('rechaza captura inválida %j', (bad) => {
    expect(() => strictDto({ ...body, ...bad }, CapturarAsistenciaDto)).toThrow(
      BadRequestException,
    );
  });
  it('mantiene el módulo deshabilitado y rechaza boolean true como bandera', () => {
    for (const value of [undefined, 'false', true])
      expect(() =>
        new AttendanceAvailabilityGuard(
          new ConfigService({ ASISTENCIA_ENABLED: value }),
        ).requireEnabled(),
      ).toThrow();
  });
  it('canónico sin depender de sesión y lock estable para UUID en mayúsculas', () => {
    expect(lockKey(ID)).toBe(lockKey(ID.toUpperCase()));
    expect(commandHash(p, ID, body)).toBe(
      commandHash({ ...p, sesionId: ID }, ID.toUpperCase(), body),
    );
    expect(commandHash(p, ID, body)).not.toBe(
      commandHash(p, ID, { ...body, estado: 'AUSENTE' }),
    );
  });
  it.each([
    { in_window: false },
    { programacion_estado: 'CANCELADA' },
    { programacion_estado: 'CERRADA' },
    { programacion_estado: 'SUSTITUIDA' },
    { contract_active: false },
    { closed: true },
    { can_capture: false },
  ])('impide elegibilidad %j', (patch) =>
    expect(noCaptureReason({ ...row(), ...patch })).not.toBeNull(),
  );
});
describe('ASI SQL explícito, sin ejecutar SQL', () => {
  it('reutiliza jerarquía, encargado y reloj por sentencia', () => {
    expect(ATTENDANCE_AUTH).toContain('encargo_permisos');
    expect(ATTENDANCE_AUTH).toContain('ANY($2::text[])');
    expect(ATTENDANCE_AUTH).not.toContain('CURRENT_TIMESTAMP');
    expect(ATTENDANCE_AUTH).toContain('statement_timestamp()');
  });
  it('revalida sesión, ámbito, contrato, ventana y cierres en INSERT', () => {
    for (const term of [
      'authorized_scopes',
      'sesiones_usuario',
      'revocada_en IS NULL',
      'c.empleado_id=p.empleado_id',
      'c.hospital_id=p.hospital_id',
      "p.estado='PROGRAMADA'",
      'cierres_balance',
      'ra.asistencia_id IS NULL',
    ])
      expect(INSERT_SQL).toContain(term);
    expect(INSERT_SQL).not.toMatch(/UPDATE|DELETE|TRUNCATE/);
  });
  it('consulta por inicio local con dos medianoches, sin PII ni filtro de adscripción', () => {
    expect(LIST_SQL).toContain('AT TIME ZONE h.zona_horaria');
    expect(LIST_SQL).toContain('$6::date+1');
    expect(LIST_SQL).not.toMatch(/rud|observaciones|adscripciones|SELECT \*/i);
  });
});
describe('ASI repositorio: transacción real del wrapper, almacenamiento simulado', () => {
  it('inserta registro, evento y auditoría antes de COMMIT, sin UPDATE/DELETE', async () => {
    const f = fixture(),
      authorize = vi.fn();
    const r = await f.repo.capture(p, ID, ID, body, authorize);
    expect(r.eventoId).toBe('9007199254740993');
    expect(r.validacionAdministrativa).toBe('PENDIENTE');
    expect(authorize).toHaveBeenCalledWith({ hospitalId: H, servicioId: ID });
    expect(f.calls.at(-1)).toBe('COMMIT');
    expect(f.calls.filter((s) => s.includes('INSERT INTO'))).toHaveLength(3);
    expect(f.calls.some((s) => /^(UPDATE|DELETE|TRUNCATE)/.test(s))).toBe(
      false,
    );
  });
  it('devuelve acuse idéntico en retry, incluso fuera de ventana', async () => {
    const f = fixture();
    const a = await f.repo.capture(p, ID, ID, body, async () => {});
    f.setRow({ in_window: false });
    const b = await f.repo.capture(p, ID, ID, body, async () => {});
    expect(b).toEqual(a);
    expect(
      f.calls.filter((s) => s.includes('INSERT INTO sigeh.eventos_asistencia')),
    ).toHaveLength(1);
  });
  it('rechaza misma clave con contenido diferente', async () => {
    const f = fixture();
    await f.repo.capture(p, ID, ID, body, async () => {});
    await expect(
      f.repo.capture(p, ID, ID, { ...body, estado: 'AUSENTE' }, async () => {}),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('dos retries concurrentes producen un evento en el simulador de lock', async () => {
    const f = fixture();
    const results = await Promise.all([
      f.repo.capture(p, ID, ID, body, async () => {}),
      f.repo.capture(p, ID, ID, body, async () => {}),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      f.calls.filter((s) => s.includes('INSERT INTO sigeh.eventos_asistencia')),
    ).toHaveLength(1);
  });
  it('dos claves distintas concurrentes: una captura y un conflicto', async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      f.repo.capture(p, ID, ID, body, async () => {}),
      f.repo.capture(p, ID, H, body, async () => {}),
    ]);
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((v) => v.status === 'rejected')).toHaveLength(1);
  });
  it.each([{ failAudit: true }, { failEvent: true }])(
    'rollback sin efectos parciales %j',
    async (options) => {
      const f = fixture(options);
      await expect(
        f.repo.capture(p, ID, ID, body, async () => {}),
      ).rejects.toThrow();
      expect(f.stored).toBeNull();
      expect(f.event).toBeNull();
      expect(f.calls.at(-1)).toBe('ROLLBACK');
    },
  );
  it('COMMIT incierto no se reintenta ni se afirma rollback', async () => {
    const f = fixture({ failCommit: true });
    await expect(
      f.repo.capture(p, ID, ID, body, async () => {}),
    ).rejects.toThrow();
    expect(f.calls.filter((s) => s === 'COMMIT')).toHaveLength(2);
    expect(f.calls).not.toContain('ROLLBACK');
  });
  it('sesión revocada tras lock impide INSERT', async () => {
    const f = fixture();
    f.onLock(() => f.setActive(false));
    await expect(
      f.repo.capture(p, ID, ID, body, async () => {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.stored).toBeNull();
  });
  it('permiso/ámbito revocado durante espera impide captura', async () => {
    const f = fixture();
    f.onLock(() => f.setVisible(false));
    await expect(
      f.repo.capture(p, ID, ID, body, async () => {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.stored).toBeNull();
  });
  it('fallo de autorización no crea eventos', async () => {
    const f = fixture();
    await expect(
      f.repo.capture(p, ID, ID, body, async () => {
        throw new ForbiddenException();
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.event).toBeNull();
  });
  it('registro preexistente y fuera de ventana rechazan antes de insertar', async () => {
    for (const patch of [{ in_window: false }, { asistencia_id: H }]) {
      const f = fixture();
      f.setRow(patch);
      await expect(
        f.repo.capture(p, ID, ID, body, async () => {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(f.event).toBeNull();
    }
  });
  it('Coordinación recupera estado, validación y autor separados sin convertirlos en cobertura', async () => {
    const f = fixture();
    f.setRow({
      asistencia_id: H,
      asistencia_estado: 'AUSENTE',
      validacion: 'PENDIENTE',
      revision: '9007199254740993',
      capture_event_id: '9007199254740993',
      capture_actor_id: ID,
      capture_time: new Date('2026-11-22T10:00:00Z'),
    });
    const r = await f.repo.list(p, strictDto(q, PaseListaQueryDto));
    expect(r.items[0]).toMatchObject({
      capturada: true,
      estadoOperativo: 'AUSENTE',
      validacionAdministrativa: 'PENDIENTE',
      capturable: false,
      motivoNoCapturable: 'YA_REGISTRADA',
      ultimaCaptura: { actorId: ID, eventoId: '9007199254740993' },
    });
    expect(JSON.stringify(r)).not.toMatch(
      /incidencia|cobertura|validado_por|observaciones/,
    );
  });
  it('lista paginada sin fila proyecta pendiente sin insertar ni revelar RUD', async () => {
    const f = fixture();
    const r = await f.repo.list(
      p,
      strictDto({ ...q, limit: 1 }, PaseListaQueryDto),
    );
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBe(ID);
    expect(r.items[0]).toMatchObject({
      capturada: false,
      estadoOperativo: 'PENDIENTE',
      revision: '0',
      ultimaCaptura: null,
    });
    expect(JSON.stringify(r)).not.toMatch(/rud|password|token/i);
    expect(f.calls.some((s) => s.includes('INSERT INTO'))).toBe(false);
  });
});

describe('ASI servicio: errores acotados sin filtración ni ampliación de permisos', () => {
  function service(error: unknown) {
    const grant: PersistedAssignment = {
      kind: 'TITULAR',
      mandateFrom: new Date('2026-01-01'),
      mandateUntil: null,
      encargoPermissions: [],
      usuarioActivo: true,
      hospitalActivo: true,
      scope: { hospitalId: H, divisionId: null, servicioId: null },
      division: null,
      servicio: null,
      vigenteDesde: new Date('2026-01-01'),
      vigenteHasta: null,
      observedAt: new Date('2026-11-22'),
      permissions: ['ASISTENCIA_CAPTURAR'],
    };
    const capture = vi.fn(async () => {
      throw error;
    });
    const repo = { capture };
    const ready = new AttendanceAvailabilityGuard(
      new ConfigService({ ASISTENCIA_ENABLED: 'true' }),
    );
    return {
      capture,
      svc: new AsistenciaService(
        ready,
        {} as IamService,
        { assignments: async () => [grant] } as unknown as AccessRepository,
        repo as unknown as AsistenciaRepository,
      ),
    };
  }
  it('solo el UNIQUE de programación se traduce a YA_REGISTRADA', async () => {
    const t = service({
      code: '23505',
      constraint: 'registros_asistencia_programacion_id_key',
    });
    await expect(t.svc.capture(p, ID, ID, body)).rejects.toThrow(
      'YA_REGISTRADA',
    );
    expect(t.capture).toHaveBeenCalledTimes(1);
  });
  it.each([
    { code: '23505', constraint: 'otro_unique' },
    { code: '55P03' },
    { code: '57014' },
    { code: '40P01' },
    new Error('PRIVATE_DATABASE_ERROR'),
  ])('sanitiza fallo sin reintentar %j', async (error) => {
    const t = service(error);
    await expect(t.svc.capture(p, ID, ID, body)).rejects.toThrow(
      'Asistencia no disponible; reintente con la misma clave',
    );
    expect(t.capture).toHaveBeenCalledTimes(1);
  });
});
