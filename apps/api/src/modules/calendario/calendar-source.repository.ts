import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type PoolClient, type QueryResultRow } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import {
  requireTransactionScope,
  type TargetScope,
} from '../preparacion/scoped-transaction.js';
import { type CalendarSnapshot } from './calendar.model.js';
import { tomorrow } from './calendar-time.js';

// SELECT-only sources. No SELECT *, credentials, names or RUD. All dynamic values
// are parameters. Limits fail closed instead of returning a partial service.
@Injectable()
export class CalendarSourceRepository {
  constructor(private readonly postgres: PostgresService) {}
  async load(
    actor: Principal,
    scope: TargetScope & { servicioId: string },
  ): Promise<CalendarSnapshot> {
    try {
      return await this.postgres.withTransaction(
        async (client) => {
          await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
          await client.query("SET LOCAL statement_timeout='5s'");
          return this.loadInTransaction(client, actor, scope);
        },
        { readOnly: true },
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException(
        'Fuentes de calendario no disponibles; revisar permisos y configuración',
      );
    }
  }
  async loadInTransaction(
    client: PoolClient,
    actor: Principal,
    scope: TargetScope & { servicioId: string },
  ): Promise<CalendarSnapshot> {
    const context = await client.query<{
      zone: string;
      divisionId: string;
      now: Date;
    }>(
      `SELECT h.zona_horaria AS zone,s.division_id AS "divisionId",CURRENT_TIMESTAMP AS now
          FROM sigeh.servicios s JOIN sigeh.divisiones d ON d.division_id=s.division_id AND d.hospital_id=s.hospital_id AND d.activo
          JOIN sigeh.hospitales h ON h.hospital_id=s.hospital_id AND h.activo
          WHERE s.servicio_id=$1::uuid AND s.hospital_id=$2::uuid AND s.activo
          AND ($3::uuid IS NULL OR s.division_id=$3::uuid)`,
      [scope.servicioId, scope.hospitalId, scope.divisionId ?? null],
    );
    const ctx = context.rows[0];
    if (!ctx) throw new ForbiddenException('Ámbito no disponible');
    await requireTransactionScope(client, actor, 'PROGRAMACION_SIMULAR', {
      ...scope,
      divisionId: ctx.divisionId,
    });
    const date = tomorrow(ctx.now, ctx.zone);
    const contracts = await this.rows<CalendarSnapshot['contracts'][number]>(
      client,
      `SELECT c.contrato_id AS id,c.empleado_id AS "employeeId",c.hospital_id AS "hospitalId",e.activo AS "activeEmployee",c.estado AS state,c.tipo AS type,
          to_char(c.inicio,'YYYY-MM-DD') AS start,to_char(c.fin,'YYYY-MM-DD') AS end
          FROM sigeh.contratos c JOIN sigeh.empleados e ON e.empleado_id=c.empleado_id
          WHERE c.hospital_id=$1::uuid AND EXISTS(SELECT 1 FROM sigeh.adscripciones a
            WHERE a.contrato_id=c.contrato_id AND a.servicio_id=$2::uuid AND a.inicio<=$3::date AND (a.fin IS NULL OR a.fin>=$3::date))
          ORDER BY c.contrato_id LIMIT 10001`,
      [scope.hospitalId, scope.servicioId, date],
    );
    const ids = contracts.map((c) => c.id),
      employees = [...new Set(contracts.map((c) => c.employeeId))];
    const assignments = await this.rows<
      CalendarSnapshot['assignments'][number]
    >(
      client,
      `SELECT a.adscripcion_id AS id,a.contrato_id AS "contractId",a.servicio_id AS "serviceId",s.hospital_id AS "hospitalId",a.clase AS kind,
          to_char(a.inicio,'YYYY-MM-DD') AS start,to_char(a.fin,'YYYY-MM-DD') AS end
          FROM sigeh.adscripciones a JOIN sigeh.servicios s ON s.servicio_id=a.servicio_id
          WHERE a.contrato_id=ANY($1::uuid[]) AND a.inicio<=$2::date AND (a.fin IS NULL OR a.fin>=$2::date) LIMIT 10001`,
      [ids, date],
    );
    const patterns = await this.rows<CalendarSnapshot['patterns'][number]>(
      client,
      `SELECT ep.empleado_patron_id AS id,ep.contrato_id AS "contractId",to_char(ep.inicio,'YYYY-MM-DD') AS start,to_char(ep.fin,'YYYY-MM-DD') AS end,
          p.activo AS active,p.clase AS kind,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('iso',pd.dia_iso,'kind',pd.tipo_dia) ORDER BY pd.dia_iso) FROM sigeh.patron_dias pd WHERE pd.patron_id=p.patron_id),'[]'::jsonb) AS days,
          CASE WHEN h.horario_id IS NULL THEN NULL ELSE jsonb_build_object('id',h.horario_id,'start',h.hora_inicio::text,'end',h.hora_fin::text,'overnight',h.cruza_medianoche) END AS schedule
          FROM sigeh.empleado_patrones ep JOIN sigeh.patrones_laborales p ON p.patron_id=ep.patron_id LEFT JOIN sigeh.horarios h ON h.horario_id=p.horario_id
          WHERE ep.contrato_id=ANY($1::uuid[]) AND ep.inicio<=$2::date AND (ep.fin IS NULL OR ep.fin>=$2::date) LIMIT 10001`,
      [ids, date],
    );
    // Neighboring days stay within the authorized hospital AND service.
    // Global employee conflicts require an independently authorized context.
    const existing = await this.rows<CalendarSnapshot['existing'][number]>(
      client,
      `SELECT p.programacion_id AS id,p.empleado_id AS "employeeId",p.servicio_id AS "serviceId",p.inicio_programado AS start,p.fin_programado AS end,p.estado AS state
          FROM sigeh.programacion_laboral p WHERE p.hospital_id=$4::uuid AND p.servicio_id=$3::uuid
          AND p.inicio_programado < (($1::date+9)::timestamp AT TIME ZONE $2)
          AND p.fin_programado > (($1::date-8)::timestamp AT TIME ZONE $2) LIMIT 10001`,
      [date, ctx.zone, scope.servicioId, scope.hospitalId],
    );
    for (const row of existing) {
      row.start = new Date(row.start).toISOString();
      row.end = new Date(row.end).toISOString();
    }
    const holidays = await this.rows<CalendarSnapshot['holidays'][number]>(
      client,
      "SELECT to_char(fecha,'YYYY-MM-DD') AS date,oficial AS official FROM sigeh.calendario_festivos WHERE hospital_id=$1::uuid AND fecha=$2::date LIMIT 10001",
      [scope.hospitalId, date],
    );
    const exceptions = await this.rows<CalendarSnapshot['exceptions'][number]>(
      client,
      `SELECT m.movimiento_id AS id,ARRAY[c.titular_empleado_id,c.sustituto_empleado_id] AS "employeeIds",c.aplicado AS applied,m.estado AS state,c.programacion_original_id AS "originalId",c.programacion_sustituta_id AS "replacementId",c.inicio_sustitucion AS start,c.fin_sustitucion AS end,NULL::text AS "originalDate"
          FROM sigeh.convenios_sustitucion c JOIN sigeh.movimientos_laborales m ON m.movimiento_id=c.movimiento_id
          WHERE m.hospital_id=$1::uuid AND EXISTS(SELECT 1 FROM sigeh.programacion_laboral original WHERE original.programacion_id=c.programacion_original_id AND original.hospital_id=$1::uuid AND original.servicio_id=$5::uuid) AND (c.titular_empleado_id=ANY($2::uuid[]) OR c.sustituto_empleado_id=ANY($2::uuid[]))
          AND c.inicio_sustitucion < (($3::date+2)::timestamp AT TIME ZONE $4) AND c.fin_sustitucion > (($3::date-1)::timestamp AT TIME ZONE $4)
          UNION ALL
          SELECT m.movimiento_id,ARRAY[c.empleado_id],c.aplicado,m.estado,c.programacion_original_id,c.programacion_nueva_id,c.inicio_nueva_jornada,c.fin_nueva_jornada,to_char(c.fecha_descanso_original,'YYYY-MM-DD')
          FROM sigeh.cambios_descanso c JOIN sigeh.movimientos_laborales m ON m.movimiento_id=c.movimiento_id
          WHERE m.hospital_id=$1::uuid AND EXISTS(SELECT 1 FROM sigeh.programacion_laboral original WHERE original.programacion_id=c.programacion_original_id AND original.hospital_id=$1::uuid AND original.servicio_id=$5::uuid) AND c.empleado_id=ANY($2::uuid[])
          AND (c.fecha_descanso_original=$3::date OR (c.inicio_nueva_jornada < (($3::date+2)::timestamp AT TIME ZONE $4) AND c.fin_nueva_jornada > (($3::date-1)::timestamp AT TIME ZONE $4))) LIMIT 10001`,
      [scope.hospitalId, employees, date, ctx.zone, scope.servicioId],
    );
    for (const row of exceptions) {
      row.start = new Date(row.start).toISOString();
      row.end = new Date(row.end).toISOString();
    }
    // Follow only explicit movement references belonging to this hospital;
    // a replacement can lie outside the neighboring-day context window.
    const referencedIds = [
      ...new Set(
        exceptions.flatMap((e) => [
          e.originalId,
          ...(e.replacementId ? [e.replacementId] : []),
        ]),
      ),
    ].filter((id) => !existing.some((p) => p.id === id));
    if (referencedIds.length) {
      const referenced = await this.rows<CalendarSnapshot['existing'][number]>(
        client,
        `SELECT programacion_id AS id,empleado_id AS "employeeId",servicio_id AS "serviceId",inicio_programado AS start,fin_programado AS end,estado AS state
               FROM sigeh.programacion_laboral WHERE programacion_id=ANY($1::uuid[]) AND hospital_id=$2::uuid AND servicio_id=$3::uuid LIMIT 10001`,
        [referencedIds, scope.hospitalId, scope.servicioId],
      );
      for (const row of referenced) {
        row.start = new Date(row.start).toISOString();
        row.end = new Date(row.end).toISOString();
      }
      existing.push(...referenced);
    }
    const closures = await this.rows<CalendarSnapshot['closures'][number]>(
      client,
      `SELECT inicio AS start,fin AS end FROM sigeh.cierres_balance WHERE hospital_id=$1::uuid AND servicio_id=$2::uuid
          AND inicio < (($3::date+2)::timestamp AT TIME ZONE $4) AND fin > ($3::date::timestamp AT TIME ZONE $4) LIMIT 10001`,
      [scope.hospitalId, scope.servicioId, date, ctx.zone],
    );
    for (const row of closures) {
      row.start = new Date(row.start).toISOString();
      row.end = new Date(row.end).toISOString();
    }
    const rotations = await this.rows<
      NonNullable<CalendarSnapshot['rotations']>[number]
    >(
      client,
      `SELECT r.contrato_id AS "contractId",r.subarea_id AS "subareaId",to_char(r.inicio,'YYYY-MM-DD') AS start,to_char(r.fin,'YYYY-MM-DD') AS end
             FROM sigeh.rotaciones_subarea r JOIN sigeh.subareas sa ON sa.subarea_id=r.subarea_id AND sa.hospital_id=$2::uuid AND sa.servicio_id=$3::uuid AND sa.activo
             WHERE r.contrato_id=ANY($1::uuid[]) AND r.inicio<=$4::date AND r.fin>=$4::date LIMIT 10001`,
      [ids, scope.hospitalId, scope.servicioId, date],
    );
    const incidents = await this.rows<
      NonNullable<CalendarSnapshot['incidents']>[number]
    >(
      client,
      `SELECT i.empleado_id AS "employeeId",i.estado AS state,t.codigo AS nature,t.afecta_disponibilidad AS "affectsAvailability",i.inicio AS start,i.fin AS end,
             COALESCE((SELECT a.decision='APROBADA' FROM sigeh.incidencia_autorizaciones a WHERE a.incidencia_id=i.incidencia_id ORDER BY a.decidido_en DESC,a.autorizacion_id DESC LIMIT 1),false) AS approved
             FROM sigeh.incidencias i JOIN sigeh.tipos_incidencia t ON t.tipo_incidencia_id=i.tipo_incidencia_id AND t.hospital_id=i.hospital_id
             WHERE i.hospital_id=$1::uuid AND i.empleado_id=ANY($2::uuid[]) AND i.estado IN ('CAPTURADA','EN_REVISION','AUTORIZADA')
             AND i.inicio<(($3::date+2)::timestamp AT TIME ZONE $4) AND i.fin>($3::date::timestamp AT TIME ZONE $4) LIMIT 10001`,
      [scope.hospitalId, employees, date, ctx.zone],
    );
    for (const row of incidents) {
      row.start = new Date(row.start).toISOString();
      row.end = new Date(row.end).toISOString();
    }
    return {
      conflictContext: 'SERVICE_ONLY',
      hospitalId: scope.hospitalId,
      serviceId: scope.servicioId,
      divisionId: ctx.divisionId,
      zone: ctx.zone,
      date,
      contracts,
      assignments,
      patterns,
      existing,
      holidays,
      exceptions,
      closures,
      rotations,
      incidents,
    };
  }
  private async rows<T>(
    client: PoolClient,
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const r = await client.query<T & QueryResultRow>(sql, params);
    if (r.rows.length > 10000)
      throw new ServiceUnavailableException(
        'Servicio supera el límite de simulación; no se devuelve un cálculo parcial',
      );
    return r.rows;
  }
}
