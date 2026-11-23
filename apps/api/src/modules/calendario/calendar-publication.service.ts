import {
  ConflictException,
  Injectable,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type Principal } from '../iam/domain/session-model.js';
import {
  requireTransactionScope,
  type TargetScope,
} from '../preparacion/scoped-transaction.js';
import { PostgresService } from '../../database/postgres.service.js';
import { CalendarSourceRepository } from './calendar-source.repository.js';
import { simulateCalendar } from './calendar-simulation.service.js';
import { type CalendarPolicies } from './calendar.model.js';
import { type PoolClient } from 'pg';
import { isUUID } from 'class-validator';
import { calendarDate } from '../gestion-laboral/labor.rules.js';
export interface ApprovedCalendarPolicy {
  version: string;
  rules: CalendarPolicies;
}
// No institutional policy is supplied by configuration defaults or a request.
// A separately reviewed provider must be implemented before this can publish.
@Injectable()
export class CalendarPolicyProvider {
  async current(_scope: TargetScope): Promise<ApprovedCalendarPolicy | null> {
    return null;
  }
}
export interface PublicationRequest {
  fecha: string;
  fingerprint: string;
  policyVersion: string;
  idempotencyKey: string;
}
@Injectable()
export class CalendarPublicationService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly source: CalendarSourceRepository,
    private readonly policies: CalendarPolicyProvider,
  ) {}
  async publish(
    actor: Principal,
    scope: TargetScope & { servicioId: string },
    input: PublicationRequest,
  ) {
    calendarDate(input.fecha);
    if (
      !isUUID(input.idempotencyKey, '4') ||
      !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
      !input.policyVersion ||
      input.policyVersion.length > 100
    )
      throw new UnprocessableEntityException(
        'Identidad de publicación inválida',
      );
    const policy = await this.policies.current(scope);
    if (!policy)
      throw new ServiceUnavailableException(
        'Publicación bloqueada: política institucional no aprobada',
      );
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify([
          scope.hospitalId,
          scope.servicioId,
          input.fecha,
          input.fingerprint,
          input.policyVersion,
        ]),
      )
      .digest('hex');
    try {
      return await this.postgres.withTransaction(
        async (c) => {
          await c.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          await c.query("SET LOCAL lock_timeout='2s'");
          await c.query("SET LOCAL statement_timeout='5s'");
          await requireTransactionScope(
            c,
            actor,
            'PROGRAMACION_PUBLICAR',
            scope,
            true,
          );
          await c.query(
            'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',
            [`CAL:${scope.hospitalId}:${scope.servicioId}:${input.fecha}`],
          );
          const previous = (
            await c.query<{ publicacionId: string; requestHash: string }>(
              'SELECT publicacion_id AS "publicacionId",request_hash AS "requestHash" FROM sigeh.cal_publicaciones WHERE hospital_id=$1::uuid AND servicio_id=$2::uuid AND fecha=$3::date AND idempotency_key=$4::uuid',
              [
                scope.hospitalId,
                scope.servicioId,
                input.fecha,
                input.idempotencyKey,
              ],
            )
          ).rows[0];
          if (previous) {
            if (previous.requestHash !== requestHash)
              throw new ConflictException(
                'Idempotency-Key reutilizada con otra solicitud',
              );
            return { publicacionId: previous.publicacionId, replayed: true };
          }
          if (policy.version !== input.policyVersion)
            throw new ConflictException('Versión de política obsoleta');
          const snapshot = await this.source.loadInTransaction(c, actor, scope);
          if (
            snapshot.date !== input.fecha ||
            snapshot.conflictContext !== 'AUTHORIZED_EMPLOYEE_CONTEXT'
          )
            throw new UnprocessableEntityException(
              'Fecha o contexto global no autorizado para publicación',
            );
          const simulation = simulateCalendar(snapshot, policy.rules);
          if (simulation.fingerprint !== input.fingerprint)
            throw new ConflictException('Fuentes cambiaron: volver a simular');
          if (!simulation.publishable || !simulation.candidates.length)
            throw new UnprocessableEntityException(
              'Simulación con conflictos o sin jornadas',
            );
          for (const employee of [
            ...new Set(simulation.candidates.map((x) => x.employeeId)),
          ].sort())
            await c.query(
              'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',
              [`EMPLOYEE:${employee}`],
            );
          const publication = (
            await c.query<{ id: string }>(
              `INSERT INTO sigeh.cal_publicaciones(hospital_id,servicio_id,fecha,actor_id,idempotency_key,request_hash,fingerprint,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING publicacion_id AS id`,
              [
                scope.hospitalId,
                scope.servicioId,
                input.fecha,
                actor.usuarioId,
                input.idempotencyKey,
                requestHash,
                input.fingerprint,
                policy.version,
              ],
            )
          ).rows[0]!;
          const ids: string[] = [];
          for (const candidate of simulation.candidates) {
            const row = (
              await c.query<{ id: string }>(
                `INSERT INTO sigeh.programacion_laboral(empleado_id,contrato_id,hospital_id,servicio_id,subarea_id,horario_id,inicio_programado,fin_programado,origen,estado)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PATRON','PROGRAMADA') RETURNING programacion_id AS id`,
                [
                  candidate.employeeId,
                  candidate.contractId,
                  scope.hospitalId,
                  scope.servicioId,
                  candidate.subareaId ?? null,
                  candidate.scheduleId,
                  candidate.start,
                  candidate.end,
                ],
              )
            ).rows[0]!;
            await c.query(
              `INSERT INTO sigeh.cal_publicacion_jornadas(publicacion_id,programacion_id,empleado_id,contrato_id,hospital_id,servicio_id,fecha,horario_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                publication.id,
                row.id,
                candidate.employeeId,
                candidate.contractId,
                scope.hospitalId,
                scope.servicioId,
                input.fecha,
                candidate.scheduleId,
              ],
            );
            ids.push(row.id);
          }
          await this.audit(c, actor, scope.hospitalId, publication.id, {
            fecha: input.fecha,
            fingerprint: input.fingerprint,
            policyVersion: policy.version,
            jornadas: ids,
          });
          return { publicacionId: publication.id, replayed: false };
        },
        { readOnly: false },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        ['23505', '23P01', '40001', '40P01', '55P03'].includes(
          (error as { code?: string }).code ?? '',
        )
      )
        throw new ConflictException(
          'Publicación concurrente: reconciliar y volver a simular',
        );
      throw new ServiceUnavailableException(
        'Publicación no disponible; resultado debe reconciliarse antes de reintentar',
      );
    }
  }
  private async audit(
    c: PoolClient,
    p: Principal,
    hospital: string,
    id: string,
    data: unknown,
  ) {
    await c.query(
      "INSERT INTO sigeh.auditoria_general(hospital_id,tabla,registro_id,accion,actor_id,nuevo) VALUES($1,'cal_publicaciones',$2,'INSERT',$3,$4::jsonb)",
      [hospital, id, p.usuarioId, JSON.stringify(data)],
    );
  }
}
