import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type PoolClient, type QueryResultRow } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import {
  type CapturarAsistenciaDto,
  type CaptureReceiptDto,
  type PaseListaQueryDto,
  type PaseListaPageDto,
  type Reason,
} from './asistencia.dto.js';
import {
  SESSION_SQL,
  CONTEXT_SQL,
  RESOURCE_SQL,
  LIST_SQL,
  REPLAY_SQL,
  INSERT_SQL,
} from './asistencia.sql.js';
export const CAPTURE_PERMISSION = 'ASISTENCIA_CAPTURAR';
export const READ_PERMISSIONS = [CAPTURE_PERMISSION, 'ASISTENCIA_VALIDAR'];
export interface AttendanceRow extends QueryResultRow {
  programacion_id: string;
  hospital_id: string;
  servicio_id: string;
  empleado_id: string;
  nombres: string;
  primer_apellido: string;
  horario_id: string | null;
  turno_codigo: string | null;
  inicio_programado: Date;
  fin_programado: Date;
  programacion_estado: string;
  asistencia_id: string | null;
  asistencia_estado: string | null;
  validacion: string | null;
  in_window: boolean;
  contract_active: boolean;
  closed: boolean;
  can_capture: boolean;
  revision: string | null;
  capture_event_id: string | null;
  capture_actor_id: string | null;
  capture_time: Date | null;
}
interface EventRow extends QueryResultRow {
  evento_id: string;
  actor_id: string;
  ocurrido_en: Date;
  asistencia_id: string;
  datos: { commandHash: string; estado: CapturarAsistenciaDto['estado'] };
}
export function noCaptureReason(r: AttendanceRow): Reason | null {
  if (r.asistencia_id) return 'YA_REGISTRADA';
  if (!r.in_window) return 'FUERA_VENTANA';
  if (r.programacion_estado !== 'PROGRAMADA')
    return 'PROGRAMACION_NO_CAPTURABLE';
  if (!r.contract_active) return 'CONTRATO_NO_VIGENTE';
  if (r.closed) return 'CIERRE_EXISTENTE';
  if (!r.can_capture) return 'SIN_FACULTAD_CAPTURA';
  return null;
}
export function commandHash(
  p: Principal,
  id: string,
  b: CapturarAsistenciaDto,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        1,
        p.usuarioId.toLowerCase(),
        id.toLowerCase(),
        b.estado,
        b.expectedRevision,
      ]),
    )
    .digest('hex');
}
export function lockKey(id: string): string {
  return createHash('sha256')
    .update('sigeh:asistencia:v1:' + id.toLowerCase())
    .digest()
    .readBigInt64BE(0)
    .toString();
}
function receipt(id: string, r: EventRow): CaptureReceiptDto {
  return {
    programacionId: id,
    asistenciaId: r.asistencia_id,
    eventoId: r.evento_id,
    estadoOperativo: r.datos.estado,
    validacionAdministrativa: 'PENDIENTE',
    actorId: r.actor_id,
    registradoEn: r.ocurrido_en.toISOString(),
    revision: r.evento_id,
  };
}
@Injectable()
export class AsistenciaRepository {
  constructor(private readonly db: PostgresService) {}
  private async session(c: PoolClient, p: Principal): Promise<void> {
    const r = await c.query<{ active: boolean }>(SESSION_SQL, [
      p.usuarioId,
      [],
      p.sesionId,
    ]);
    if (!r.rows[0]?.active) throw new UnauthorizedException('Sesión inválida');
  }
  async list(p: Principal, q: PaseListaQueryDto): Promise<PaseListaPageDto> {
    return this.db.withTransaction(
      async (c) => {
        await this.session(c, p);
        const args = [
          p.usuarioId,
          READ_PERMISSIONS,
          p.sesionId,
          q.hospitalId,
          q.servicioId,
        ];
        const ctx = await c.query<{ zona_horaria: string }>(CONTEXT_SQL, args);
        if (!ctx.rows[0]) throw new NotFoundException('Contexto no disponible');
        const r = await c.query<AttendanceRow>(LIST_SQL, [
          ...args,
          q.fecha,
          q.horarioId ?? null,
          q.cursor ?? null,
          q.limit + 1,
        ]);
        await this.session(c, p);
        const rows = r.rows.slice(0, q.limit);
        return {
          hospitalId: q.hospitalId,
          servicioId: q.servicioId,
          fecha: q.fecha,
          zonaHoraria: ctx.rows[0].zona_horaria,
          nextCursor:
            r.rows.length > q.limit ? rows.at(-1)!.programacion_id : null,
          limit: q.limit,
          order: 'id:asc',
          items: rows.map((v) => ({
            programacionId: v.programacion_id,
            empleado: {
              empleadoId: v.empleado_id,
              nombres: v.nombres,
              primerApellido: v.primer_apellido,
            },
            horarioId: v.horario_id,
            turnoCodigo: v.turno_codigo,
            inicioProgramado: v.inicio_programado.toISOString(),
            finProgramado: v.fin_programado.toISOString(),
            estadoProgramacion: v.programacion_estado,
            capturada: v.asistencia_id !== null,
            asistenciaId: v.asistencia_id,
            estadoOperativo: v.asistencia_estado ?? 'PENDIENTE',
            validacionAdministrativa: v.validacion,
            revision: v.revision ?? '0',
            ultimaCaptura: v.capture_event_id
              ? {
                  eventoId: v.capture_event_id,
                  actorId: v.capture_actor_id!,
                  registradoEn: v.capture_time!.toISOString(),
                }
              : null,
            capturable: noCaptureReason(v) === null,
            motivoNoCapturable: noCaptureReason(v),
          })),
        };
      },
      { readOnly: true },
    );
  }
  async capture(
    p: Principal,
    id: string,
    key: string,
    b: CapturarAsistenciaDto,
    authorize: (scope: {
      hospitalId: string;
      servicioId: string;
    }) => Promise<void>,
  ): Promise<CaptureReceiptDto> {
    // IAM authorization emits its own audit via the pool. Release this read client
    // before invoking it, so even a one-connection pool cannot starve itself.
    const scope = await this.db.withTransaction(
      async (c) => {
        await this.session(c, p);
        const r = (
          await c.query<AttendanceRow>(RESOURCE_SQL, [
            p.usuarioId,
            [CAPTURE_PERMISSION],
            p.sesionId,
            id,
          ])
        ).rows[0];
        if (!r) throw new NotFoundException('Programación no disponible');
        return { hospitalId: r.hospital_id, servicioId: r.servicio_id };
      },
      { readOnly: true },
    );
    await authorize(scope);
    return this.db.withTransaction(
      async (c) => {
        await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await c.query("SET LOCAL lock_timeout='2s'");
        await c.query("SET LOCAL statement_timeout='5s'");
        const args = [p.usuarioId, [CAPTURE_PERMISSION], p.sesionId, id];
        await this.session(c, p);
        let r = (await c.query<AttendanceRow>(RESOURCE_SQL, args)).rows[0];
        if (!r) throw new NotFoundException('Programación no disponible');
        // pg_advisory_xact_lock waits are also bounded by statement_timeout.
        await c.query('SELECT pg_advisory_xact_lock($1::bigint)', [
          lockKey(id),
        ]);
        await this.session(c, p);
        r = (await c.query<AttendanceRow>(RESOURCE_SQL, args)).rows[0];
        if (!r) throw new NotFoundException('Programación no disponible');
        const hash = commandHash(p, id, b);
        const replay = await c.query<EventRow>(REPLAY_SQL, [
          id,
          p.usuarioId,
          key,
        ]);
        if (replay.rows.length) {
          if (
            replay.rows.length !== 1 ||
            replay.rows[0].datos.commandHash !== hash
          )
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return receipt(id, replay.rows[0]);
        }
        const reason = noCaptureReason(r);
        if (reason === 'SIN_FACULTAD_CAPTURA')
          throw new ForbiddenException('Acceso denegado');
        if (reason) throw new ConflictException(reason);
        const inserted = await c.query<{ asistencia_id: string }>(INSERT_SQL, [
          ...args,
          b.estado,
        ]);
        if (!inserted.rows[0]) {
          await this.session(c, p);
          // Concurrent revocation or eligibility change; never continue with partial effects.
          const current = (await c.query<AttendanceRow>(RESOURCE_SQL, args))
            .rows[0];
          if (!current)
            throw new NotFoundException('Programación no disponible');
          throw new ConflictException(
            noCaptureReason(current) ?? 'PROGRAMACION_NO_CAPTURABLE',
          );
        }
        const aid = inserted.rows[0].asistencia_id;
        const data = {
          schemaVersion: 1,
          clientEventId: key,
          commandHash: hash,
          estado: b.estado,
          anterior: null,
          expectedRevision: b.expectedRevision,
          asistenciaId: aid,
        };
        const event = await c.query<EventRow>(
          `INSERT INTO sigeh.eventos_asistencia(asistencia_id,clase,actor_id,datos,ocurrido_en)
    VALUES($1::uuid,'CAPTURA_INICIAL',$2::uuid,$3::jsonb,clock_timestamp()) RETURNING evento_id::text,actor_id,ocurrido_en,datos,asistencia_id`,
          [aid, p.usuarioId, JSON.stringify(data)],
        );
        const ev = event.rows[0];
        if (!ev) throw new Error('CAPTURE_EVENT_MISSING');
        await c.query(
          `INSERT INTO sigeh.auditoria_general(hospital_id,tabla,registro_id,accion,actor_id,anterior,nuevo)
    VALUES($1::uuid,'registros_asistencia',$2::uuid,'INSERT',$3::uuid,NULL,$4::jsonb)`,
          [
            r.hospital_id,
            aid,
            p.usuarioId,
            JSON.stringify({
              programacionId: id,
              asistenciaId: aid,
              eventoId: ev.evento_id,
              estado: b.estado,
            }),
          ],
        );
        return receipt(id, ev);
      },
      { readOnly: false },
    );
  }
}
