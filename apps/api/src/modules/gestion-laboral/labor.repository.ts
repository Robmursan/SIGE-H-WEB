import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type PoolClient } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import { requireTransactionScope } from '../preparacion/scoped-transaction.js';
import { localDate, localInstant } from '../calendario/calendar-time.js';
import {
  calendarDate,
  datePeriod,
  hoursRule,
  instantPeriod,
  sevenDays,
} from './labor.rules.js';
import {
  type AssignPatternDto,
  type LaborConfigurationQuery,
  type LaborConfigurationPatternDto,
  type CreateAdscriptionDto,
  type CreateHoursDto,
  type CreateLaborIncidentDto,
  type CreatePatternDto,
  type CreateRotationDto,
  type LaborDateQuery,
  type LaborIncidentQuery,
  type LaborIncidentHistoryQuery,
  type LaborPageDto,
  type LaborScopeDto,
} from './labor.dto.js';
export const LABOR_PERMISSIONS = {
  adscription: 'ADSCRIPCIONES_GESTIONAR',
  distribution: 'PERSONAL_DISTRIBUIR',
  hours: 'HORARIOS_CONFIGURAR',
  pattern: 'PATRONES_ASIGNAR',
  vacationCreate: 'VACACIONES_REGISTRAR',
  vacationRead: 'VACACIONES_CONSULTAR',
  disabilityCreate: 'INCAPACIDADES_REGISTRAR',
  disabilityRead: 'INCAPACIDADES_CONSULTAR',
} as const;
type Nature = 'VACACIONES' | 'INCAPACIDAD';
const incidentColumns = `i.incidencia_id AS "incidenciaId",i.hospital_id AS "hospitalId",i.empleado_id AS "empleadoId",i.tipo_incidencia_id AS "tipoIncidenciaId",i.inicio,i.fin,i.estado,i.capturado_por AS "capturadoPor",i.creado_en AS "creadoEn"`;
export function serviceScope<T extends LaborScopeDto>(
  scope: T,
  id: string,
): T & { servicioId: string } {
  if (scope.servicioId && scope.servicioId.toLowerCase() !== id.toLowerCase())
    throw new BadRequestException('Servicio inconsistente');
  return Object.assign(
    Object.create(Object.getPrototypeOf(scope)) as T,
    scope,
    { servicioId: id.toLowerCase() },
  );
}
function page<T>(rows: T[], q: LaborPageDto, key: (row: T) => string) {
  const items = rows.slice(0, q.limit);
  return {
    items,
    nextCursor: rows.length > q.limit ? key(items.at(-1)!) : null,
    limit: q.limit,
  };
}
@Injectable()
export class LaborRepository {
  constructor(private readonly postgres: PostgresService) {}
  private async run<T>(write: boolean, work: (c: PoolClient) => Promise<T>) {
    try {
      return await this.postgres.withTransaction(
        async (c) => {
          await c.query(
            write
              ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
              : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
          );
          await c.query("SET LOCAL lock_timeout='2s'");
          await c.query("SET LOCAL statement_timeout='5s'");
          return work(c);
        },
        { readOnly: !write },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const code = (e as { code?: string }).code;
      if (
        [
          '23505',
          '23503',
          '23514',
          '23P01',
          '40001',
          '40P01',
          '55P03',
        ].includes(code ?? '')
      )
        throw new ConflictException(
          'Relación, duplicado o modificación concurrente incompatible',
        );
      throw new ServiceUnavailableException('Operación laboral no disponible');
    }
  }
  private async authorize(
    c: PoolClient,
    p: Principal,
    permission: string,
    q: LaborScopeDto,
    write: boolean,
    hospitalOnly = false,
  ) {
    await requireTransactionScope(
      c,
      p,
      permission,
      hospitalOnly ? { hospitalId: q.hospitalId } : q,
      write,
    );
    if (hospitalOnly && (q.divisionId || q.servicioId))
      await requireTransactionScope(c, p, permission, q, write);
  }
  private async context(c: PoolClient, q: LaborScopeDto) {
    const r = await c.query<{ zone: string; now: Date }>(
      `SELECT zona_horaria AS zone,CURRENT_TIMESTAMP AS now FROM sigeh.hospitales WHERE hospital_id=$1::uuid AND activo`,
      [q.hospitalId],
    );
    if (!r.rows[0]) throw new NotFoundException('Ámbito no disponible');
    return r.rows[0];
  }
  private async contract(
    c: PoolClient,
    id: string,
    hospital: string,
    start: string,
    end: string,
    write: boolean,
  ) {
    if (write)
      await c.query(
        'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',
        [`CONTRACT:${id}`],
      );
    const r = await c.query<{ employeeId: string }>(
      `SELECT c.empleado_id AS "employeeId" FROM sigeh.contratos c JOIN sigeh.empleados e ON e.empleado_id=c.empleado_id
   WHERE c.contrato_id=$1::uuid AND c.hospital_id=$2::uuid AND c.inicio<=$3::date AND (c.fin IS NULL OR c.fin>=$4::date)
   AND ($5::boolean=false OR (e.activo AND c.estado='ACTIVO'))`,
      [id, hospital, start, end, write],
    );
    if (!r.rows[0])
      throw new UnprocessableEntityException(
        'Vínculo laboral no disponible para periodo y ámbito',
      );
    if (write)
      await c.query(
        'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',
        [`EMPLOYEE:${r.rows[0].employeeId}`],
      );
    return r.rows[0].employeeId;
  }
  private async membership(
    c: PoolClient,
    contract: string,
    q: LaborScopeDto,
    start: string,
    end: string,
  ) {
    if (!q.servicioId) throw new BadRequestException('servicioId obligatorio');
    const r = await c.query(
      `SELECT 1 FROM sigeh.adscripciones a JOIN sigeh.servicios s ON s.servicio_id=a.servicio_id AND s.hospital_id=$2::uuid
   WHERE a.contrato_id=$1::uuid AND a.servicio_id=$3::uuid AND a.inicio<=$4::date AND (a.fin IS NULL OR a.fin>=$5::date)`,
      [contract, q.hospitalId, q.servicioId, start, end],
    );
    if (!r.rows.length)
      throw new UnprocessableEntityException(
        'Vínculo laboral no disponible para periodo y ámbito',
      );
  }
  private async audit(
    c: PoolClient,
    p: Principal,
    hospital: string,
    table: string,
    id: string,
    next: unknown,
  ) {
    await c.query(
      "INSERT INTO sigeh.auditoria_general(hospital_id,tabla,registro_id,accion,actor_id,nuevo) VALUES($1,$2,$3,'INSERT',$4,$5::jsonb)",
      [hospital, table, id, p.usuarioId, JSON.stringify(next)],
    );
  }
  eligible(p: Principal, q: LaborDateQuery) {
    calendarDate(q.fecha);
    return this.run(false, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.adscription, q, true, true);
      const r = await c.query<{ contratoId: string }>(
        `SELECT c.contrato_id AS "contratoId",e.empleado_id AS "empleadoId",concat_ws(' ',e.nombres,e.primer_apellido) AS nombre,c.tipo,to_char(c.inicio,'YYYY-MM-DD') AS inicio,to_char(c.fin,'YYYY-MM-DD') AS fin
   FROM sigeh.contratos c JOIN sigeh.empleados e ON e.empleado_id=c.empleado_id AND e.activo
   WHERE c.hospital_id=$1::uuid AND c.estado='ACTIVO' AND c.inicio<=$2::date AND (c.fin IS NULL OR c.fin>=$2::date)
   AND ($3::uuid IS NULL OR c.contrato_id>$3::uuid) ORDER BY c.contrato_id LIMIT $4`,
        [q.hospitalId, q.fecha, q.cursor ?? null, q.limit + 1],
      );
      return page(r.rows, q, (r) => r.contratoId);
    });
  }
  adscription(p: Principal, id: string, b: CreateAdscriptionDto) {
    datePeriod(b.inicio, b.fin);
    return this.run(true, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.adscription, b, true, true);
      await this.contract(c, id, b.hospitalId, b.inicio, b.fin, true);
      if (
        (
          await c.query(
            'SELECT 1 FROM sigeh.adscripciones WHERE contrato_id=$1::uuid AND inicio<=$3::date AND (fin IS NULL OR fin>=$2::date)',
            [id, b.inicio, b.fin],
          )
        ).rows.length
      )
        throw new ConflictException(
          'Adscripción solapada: requiere movimiento formal; no se sobrescribe historia',
        );
      const r = await c.query(
        `INSERT INTO sigeh.adscripciones(contrato_id,servicio_id,clase,inicio,fin) VALUES($1,$2,$3,$4,$5)
   RETURNING adscripcion_id AS "adscripcionId",contrato_id AS "contratoId",servicio_id AS "servicioId",clase,to_char(inicio,'YYYY-MM-DD') AS inicio,to_char(fin,'YYYY-MM-DD') AS fin`,
        [id, b.servicioId, b.clase, b.inicio, b.fin],
      );
      await this.audit(
        c,
        p,
        b.hospitalId,
        'adscripciones',
        r.rows[0]!.adscripcionId,
        r.rows[0],
      );
      return r.rows[0];
    });
  }
  rotation(p: Principal, service: string, input: CreateRotationDto) {
    const b = serviceScope(input, service);
    datePeriod(b.inicio, b.fin);
    return this.run(true, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.distribution, b, true);
      const employee = await this.contract(
        c,
        b.contratoId,
        b.hospitalId,
        b.inicio,
        b.fin,
        true,
      );
      await this.membership(c, b.contratoId, b, b.inicio, b.fin);
      if (
        !(
          await c.query(
            'SELECT 1 FROM sigeh.subareas WHERE subarea_id=$1::uuid AND servicio_id=$2::uuid AND hospital_id=$3::uuid AND activo',
            [b.subareaId, service, b.hospitalId],
          )
        ).rows.length
      )
        throw new NotFoundException('Subárea no disponible');
      if (
        (
          await c.query(
            'SELECT 1 FROM sigeh.rotaciones_subarea r JOIN sigeh.contratos c ON c.contrato_id=r.contrato_id WHERE c.empleado_id=$1::uuid AND c.hospital_id=$2::uuid AND r.inicio<=$4::date AND r.fin>=$3::date',
            [employee, b.hospitalId, b.inicio, b.fin],
          )
        ).rows.length
      )
        throw new ConflictException(
          'Rotación solapada; no duplicar distribución',
        );
      const r = await c.query(
        `INSERT INTO sigeh.rotaciones_subarea(contrato_id,subarea_id,inicio,fin) VALUES($1,$2,$3,$4) RETURNING rotacion_id AS "rotacionId",contrato_id AS "contratoId",subarea_id AS "subareaId",to_char(inicio,'YYYY-MM-DD') AS inicio,to_char(fin,'YYYY-MM-DD') AS fin`,
        [b.contratoId, b.subareaId, b.inicio, b.fin],
      );
      const result = {
        ...r.rows[0],
        empleadoId: employee,
        servicioId: service,
      };
      await this.audit(
        c,
        p,
        b.hospitalId,
        'rotaciones_subarea',
        result.rotacionId,
        result,
      );
      return result;
    });
  }
  distribution(p: Principal, service: string, input: LaborDateQuery) {
    const q = serviceScope(input, service);
    calendarDate(q.fecha);
    return this.run(false, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.distribution, q, false);
      const r = await c.query<{ rotacionId: string; empleadoId: string }>(
        `SELECT DISTINCT r.rotacion_id AS "rotacionId",r.contrato_id AS "contratoId",ct.empleado_id AS "empleadoId",sa.subarea_id AS "subareaId",sa.servicio_id AS "servicioId",to_char(r.inicio,'YYYY-MM-DD') AS inicio,to_char(r.fin,'YYYY-MM-DD') AS fin
   FROM sigeh.rotaciones_subarea r JOIN sigeh.contratos ct ON ct.contrato_id=r.contrato_id AND ct.hospital_id=$1::uuid AND ct.estado='ACTIVO'
   JOIN sigeh.subareas sa ON sa.subarea_id=r.subarea_id AND sa.hospital_id=ct.hospital_id AND sa.servicio_id=$2::uuid AND sa.activo
   JOIN sigeh.empleados e ON e.empleado_id=ct.empleado_id AND e.activo
   WHERE r.inicio<=$3::date AND r.fin>=$3::date AND ct.inicio<=$3::date AND (ct.fin IS NULL OR ct.fin>=$3::date)
   AND EXISTS(SELECT 1 FROM sigeh.adscripciones a WHERE a.contrato_id=ct.contrato_id AND a.servicio_id=sa.servicio_id AND a.inicio<=$3::date AND (a.fin IS NULL OR a.fin>=$3::date))
   AND ($4::uuid IS NULL OR r.rotacion_id>$4::uuid) ORDER BY "rotacionId" LIMIT $5`,
        [q.hospitalId, service, q.fecha, q.cursor ?? null, q.limit + 1],
      );
      const result = page(r.rows, q, (row) => row.rotacionId);
      return {
        ...result,
        employeeCountOnPage: new Set(result.items.map((row) => row.empleadoId))
          .size,
      };
    });
  }
  hours(p: Principal, q: LaborPageDto) {
    return this.run(false, async (c) => {
      await this.authorize(c, p, 'PROGRAMACION_CONSULTAR', q, false);
      const r = await c.query<{ horarioId: string }>(
        `SELECT horario_id AS "horarioId",codigo,nombre,hora_inicio::text AS "horaInicio",hora_fin::text AS "horaFin",cruza_medianoche AS "cruzaMedianoche" FROM sigeh.horarios WHERE ($1::uuid IS NULL OR horario_id>$1::uuid) ORDER BY horario_id LIMIT $2`,
        [q.cursor ?? null, q.limit + 1],
      );
      return page(r.rows, q, (row) => row.horarioId);
    });
  }
  configuration(p: Principal, id: string, q: LaborConfigurationQuery) {
    calendarDate(q.fecha);
    return this.run(false, async (c) => {
      await this.authorize(c, p, 'PROGRAMACION_CONSULTAR', q, false);
      const employee = await this.contract(
        c,
        id,
        q.hospitalId,
        q.fecha,
        q.fecha,
        false,
      );
      await this.membership(c, id, q, q.fecha, q.fecha);
      const r = await c.query<LaborConfigurationPatternDto>(
        `SELECT ep.empleado_patron_id AS "empleadoPatronId",ep.patron_id AS "patronId",to_char(ep.inicio,'YYYY-MM-DD') AS inicio,to_char(ep.fin,'YYYY-MM-DD') AS fin,ep.autorizado_por AS "autorizadoPor",p.activo,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('diaIso',d.dia_iso,'tipoDia',d.tipo_dia) ORDER BY d.dia_iso) FROM sigeh.patron_dias d WHERE d.patron_id=p.patron_id),'[]'::jsonb) AS dias,
        h.horario_id AS "horarioId",h.hora_inicio::text AS "horaInicio",h.hora_fin::text AS "horaFin",h.cruza_medianoche AS "cruzaMedianoche"
        FROM sigeh.empleado_patrones ep JOIN sigeh.patrones_laborales p ON p.patron_id=ep.patron_id LEFT JOIN sigeh.horarios h ON h.horario_id=p.horario_id
        WHERE ep.contrato_id=$1::uuid AND ep.inicio<=$2::date AND (ep.fin IS NULL OR ep.fin>=$2::date) ORDER BY ep.empleado_patron_id LIMIT 101`,
        [id, q.fecha],
      );
      if (r.rows.length > 100)
        throw new ServiceUnavailableException(
          'Configuración supera límite; requiere revisión',
        );
      const conflictos: string[] = [];
      if (!r.rows.length) conflictos.push('PATRON_FALTANTE');
      if (r.rows.length > 1) conflictos.push('PATRONES_SOLAPADOS');
      if (r.rows.some((x) => !x.activo)) conflictos.push('PATRON_INACTIVO');
      if (r.rows.some((x) => x.dias.length !== 7))
        conflictos.push('PATRON_INCOMPLETO');
      if (r.rows.some((x) => !x.horarioId)) conflictos.push('HORARIO_FALTANTE');
      if (r.rows.some((x) => !x.autorizadoPor))
        conflictos.push('AUTORIZACION_PATRON_FALTANTE');
      return {
        contratoId: id,
        empleadoId: employee,
        hospitalId: q.hospitalId,
        servicioId: q.servicioId,
        fecha: q.fecha,
        patrones: r.rows,
        conflictos,
      };
    });
  }
  createHours(p: Principal, b: CreateHoursDto) {
    hoursRule(b.horaInicio, b.horaFin, b.cruzaMedianoche);
    return this.run(true, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.hours, b, true, true);
      const r = await c.query(
        `INSERT INTO sigeh.horarios(codigo,nombre,hora_inicio,hora_fin,cruza_medianoche) VALUES($1,$2,$3,$4,$5) RETURNING horario_id AS "horarioId",codigo,nombre,hora_inicio::text AS "horaInicio",hora_fin::text AS "horaFin",cruza_medianoche AS "cruzaMedianoche"`,
        [b.codigo, b.nombre, b.horaInicio, b.horaFin, b.cruzaMedianoche],
      );
      await this.audit(
        c,
        p,
        b.hospitalId,
        'horarios',
        r.rows[0]!.horarioId,
        r.rows[0],
      );
      return r.rows[0];
    });
  }
  private patternSelect = `SELECT p.patron_id AS "patronId",p.codigo,p.nombre,p.clase,p.horario_id AS "horarioId",p.activo,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('diaIso',d.dia_iso,'tipoDia',d.tipo_dia) ORDER BY d.dia_iso) FROM sigeh.patron_dias d WHERE d.patron_id=p.patron_id),'[]'::jsonb) AS dias FROM sigeh.patrones_laborales p`;
  patterns(p: Principal, q: LaborPageDto) {
    return this.run(false, async (c) => {
      await this.authorize(c, p, 'PROGRAMACION_CONSULTAR', q, false);
      const r = await c.query<{ patronId: string }>(
        this.patternSelect +
          ' WHERE p.activo AND ($1::uuid IS NULL OR p.patron_id>$1::uuid) ORDER BY p.patron_id LIMIT $2',
        [q.cursor ?? null, q.limit + 1],
      );
      return page(r.rows, q, (row) => row.patronId);
    });
  }
  createPattern(p: Principal, b: CreatePatternDto) {
    sevenDays(b.dias);
    return this.run(true, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.hours, b, true, true);
      const schedule = await c.query<{ overnight: boolean }>(
        'SELECT cruza_medianoche AS overnight FROM sigeh.horarios WHERE horario_id=$1::uuid',
        [b.horarioId],
      );
      if (!schedule.rows[0])
        throw new NotFoundException('Horario no disponible');
      if (b.clase === 'GUARDIA_NOCTURNA' && !schedule.rows[0].overnight)
        throw new UnprocessableEntityException(
          'Guardia nocturna requiere horario con cruce',
        );
      const r = await c.query(
        'INSERT INTO sigeh.patrones_laborales(codigo,nombre,clase,horario_id) VALUES($1,$2,$3,$4) RETURNING patron_id',
        [b.codigo, b.nombre, b.clase, b.horarioId],
      );
      const id = r.rows[0]!.patron_id as string;
      for (const day of [...b.dias].sort((a, b) => a.diaIso - b.diaIso))
        await c.query(
          'INSERT INTO sigeh.patron_dias(patron_id,dia_iso,tipo_dia) VALUES($1,$2,$3)',
          [id, day.diaIso, day.tipoDia],
        );
      const result = (
        await c.query(this.patternSelect + ' WHERE p.patron_id=$1::uuid', [id])
      ).rows[0]!;
      await this.audit(c, p, b.hospitalId, 'patrones_laborales', id, result);
      return result;
    });
  }
  assignPattern(p: Principal, id: string, b: AssignPatternDto) {
    datePeriod(b.inicio, b.fin);
    return this.run(true, async (c) => {
      await this.authorize(c, p, LABOR_PERMISSIONS.pattern, b, true, true);
      await this.contract(c, id, b.hospitalId, b.inicio, b.fin, true);
      const pattern = await c.query<{ complete: boolean }>(
        `SELECT (p.horario_id IS NOT NULL AND (SELECT count(*) FROM sigeh.patron_dias d WHERE d.patron_id=p.patron_id)=7) AS complete FROM sigeh.patrones_laborales p WHERE p.patron_id=$1::uuid AND p.activo`,
        [b.patronId],
      );
      if (!pattern.rows[0]?.complete)
        throw new UnprocessableEntityException(
          'Patrón incompleto o sin horario',
        );
      if (
        (
          await c.query(
            'SELECT 1 FROM sigeh.empleado_patrones WHERE contrato_id=$1::uuid AND inicio<=$3::date AND (fin IS NULL OR fin>=$2::date)',
            [id, b.inicio, b.fin],
          )
        ).rows.length
      )
        throw new ConflictException('Patrones de contrato solapados');
      const r = await c.query(
        `INSERT INTO sigeh.empleado_patrones(contrato_id,patron_id,inicio,fin,autorizado_por) VALUES($1,$2,$3,$4,$5) RETURNING empleado_patron_id AS "empleadoPatronId",contrato_id AS "contratoId",patron_id AS "patronId",to_char(inicio,'YYYY-MM-DD') AS inicio,to_char(fin,'YYYY-MM-DD') AS fin,autorizado_por AS "autorizadoPor"`,
        [id, b.patronId, b.inicio, b.fin, p.usuarioId],
      );
      await this.audit(
        c,
        p,
        b.hospitalId,
        'empleado_patrones',
        r.rows[0]!.empleadoPatronId,
        r.rows[0],
      );
      return r.rows[0];
    });
  }
  incident(p: Principal, nature: Nature, b: CreateLaborIncidentDto) {
    instantPeriod(b.inicio, b.fin);
    return this.run(true, async (c) => {
      await this.authorize(
        c,
        p,
        nature === 'VACACIONES'
          ? LABOR_PERMISSIONS.vacationCreate
          : LABOR_PERMISSIONS.disabilityCreate,
        b,
        true,
      );
      const context = await this.context(c, b),
        start = localDate(new Date(b.inicio), context.zone),
        end = localDate(new Date(Date.parse(b.fin) - 1), context.zone);
      const employee = await this.contract(
        c,
        b.contratoId,
        b.hospitalId,
        start,
        end,
        true,
      );
      await this.membership(c, b.contratoId, b, start, end);
      await c.query(
        'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',
        [`EMPLOYEE:${employee}`],
      );
      const type = (
        await c.query<{ partial: boolean; retro: boolean; approval: boolean }>(
          `SELECT permite_periodo_parcial AS partial,permite_retroactividad AS retro,requiere_autorizacion AS approval FROM sigeh.tipos_incidencia WHERE tipo_incidencia_id=$1::uuid AND hospital_id=$2::uuid AND codigo=$3 AND activo`,
          [b.tipoIncidenciaId, b.hospitalId, nature],
        )
      ).rows[0];
      if (!type || !type.approval)
        throw new UnprocessableEntityException(
          'Catálogo o política de autorización no habilitados',
        );
      if (!type.retro && Date.parse(b.inicio) < context.now.getTime())
        throw new UnprocessableEntityException(
          'Retroactividad no permitida por catálogo',
        );
      if (
        !type.partial &&
        (localInstant(start, '00:00', context.zone) !==
          new Date(b.inicio).toISOString() ||
          localInstant(
            localDate(new Date(b.fin), context.zone),
            '00:00',
            context.zone,
          ) !== new Date(b.fin).toISOString())
      )
        throw new UnprocessableEntityException(
          'Catálogo exige periodos de días completos',
        );
      if (
        (
          await c.query(
            `SELECT 1 FROM sigeh.incidencias WHERE empleado_id=$1::uuid AND estado IN ('CAPTURADA','EN_REVISION','AUTORIZADA') AND inicio<$3::timestamptz AND fin>$2::timestamptz`,
            [employee, b.inicio, b.fin],
          )
        ).rows.length
      )
        throw new ConflictException(
          'Incidencia solapada: requiere revisión administrativa',
        );
      const r = await c.query(
        `INSERT INTO sigeh.incidencias AS i(hospital_id,empleado_id,tipo_incidencia_id,inicio,fin,estado,capturado_por) VALUES($1,$2,$3,$4,$5,'CAPTURADA',$6) RETURNING ${incidentColumns}`,
        [
          b.hospitalId,
          employee,
          b.tipoIncidenciaId,
          b.inicio,
          b.fin,
          p.usuarioId,
        ],
      );
      const result = r.rows[0]!;
      await c.query(
        `INSERT INTO sigeh.incidencia_versiones(incidencia_id,tipo_incidencia_id,estado,inicio,fin,modificado_por,motivo_cambio) VALUES($1,$2,'CAPTURADA',$3,$4,$5,'CAPTURA_INICIAL')`,
        [result.incidenciaId, b.tipoIncidenciaId, b.inicio, b.fin, p.usuarioId],
      );
      await this.audit(c, p, b.hospitalId, 'incidencias', result.incidenciaId, {
        ...result,
        contratoVerificadoId: b.contratoId,
      });
      return result;
    });
  }
  private async incidentAccess(
    c: PoolClient,
    p: Principal,
    q: LaborIncidentHistoryQuery,
  ) {
    instantPeriod(q.desde, q.hasta);
    await this.authorize(
      c,
      p,
      q.naturaleza === 'VACACIONES'
        ? LABOR_PERMISSIONS.vacationRead
        : LABOR_PERMISSIONS.disabilityRead,
      q,
      false,
    );
    const ctx = await this.context(c, q),
      start = localDate(new Date(q.desde), ctx.zone),
      end = localDate(new Date(Date.parse(q.hasta) - 1), ctx.zone);
    const employee = await this.contract(
      c,
      q.contratoId,
      q.hospitalId,
      start,
      end,
      false,
    );
    await this.membership(c, q.contratoId, q, start, end);
    return employee;
  }
  incidents(p: Principal, q: LaborIncidentQuery) {
    return this.run(false, async (c) => {
      const employee = await this.incidentAccess(c, p, q);
      const r = await c.query<{ incidenciaId: string }>(
        `SELECT ${incidentColumns} FROM sigeh.incidencias i JOIN sigeh.tipos_incidencia t ON t.tipo_incidencia_id=i.tipo_incidencia_id AND t.hospital_id=i.hospital_id WHERE i.hospital_id=$1::uuid AND i.empleado_id=$2::uuid AND t.codigo=$3 AND i.inicio<$5::timestamptz AND i.fin>$4::timestamptz AND ($6::uuid IS NULL OR i.incidencia_id>$6::uuid) ORDER BY i.incidencia_id LIMIT $7`,
        [
          q.hospitalId,
          employee,
          q.naturaleza,
          q.desde,
          q.hasta,
          q.cursor ?? null,
          q.limit + 1,
        ],
      );
      return page(r.rows, q, (row) => row.incidenciaId);
    });
  }
  versions(p: Principal, id: string, q: LaborIncidentHistoryQuery) {
    return this.run(false, async (c) => {
      const employee = await this.incidentAccess(c, p, q);
      const found = await c.query(
        `SELECT 1 FROM sigeh.incidencias i JOIN sigeh.tipos_incidencia t ON t.tipo_incidencia_id=i.tipo_incidencia_id AND t.hospital_id=i.hospital_id WHERE i.incidencia_id=$1::uuid AND i.hospital_id=$2::uuid AND i.empleado_id=$3::uuid AND t.codigo=$4 AND i.inicio<$6::timestamptz AND i.fin>$5::timestamptz`,
        [id, q.hospitalId, employee, q.naturaleza, q.desde, q.hasta],
      );
      if (!found.rows.length)
        throw new NotFoundException('Incidencia no disponible');
      const r = await c.query(
        `SELECT version_id::text AS "versionId",tipo_incidencia_id AS "tipoIncidenciaId",estado,inicio,fin,modificado_por AS "modificadoPor",registrado_en AS "registradoEn" FROM sigeh.incidencia_versiones WHERE incidencia_id=$1::uuid ORDER BY version_id LIMIT 101`,
        [id],
      );
      if (r.rows.length > 100)
        throw new ServiceUnavailableException(
          'Historial excede límite; requiere paginación especializada',
        );
      return r.rows;
    });
  }
}
