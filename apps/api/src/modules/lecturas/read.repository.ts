import { Injectable, NotFoundException } from '@nestjs/common';
import { type QueryResultRow, type PoolClient } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import {
  STAFF_LIST_SQL,
  STAFF_DETAIL_SQL,
  EMPLOYEE_ASSIGNMENTS_SQL,
  CONTRACT_ASSIGNMENTS_SQL,
  PROGRAM_LIST_SQL,
  DASHBOARD_SQL,
} from './read.sql.js';
import {
  type StaffReadQueryDto,
  type ScheduleReadQueryDto,
  type ReadWindowDto,
  type EmployeePageDto,
  type EmployeeDetailDto,
  type AssignmentPageDto,
  type SchedulePageDto,
  type ProgrammingDashboardDto,
} from './read.dto.js';

interface StaffRow extends QueryResultRow {
  empleado_id: string;
  nombres: string;
  primer_apellido: string;
  activo: boolean;
}
interface AssignmentRow extends QueryResultRow {
  adscripcion_id: string;
  contrato_id: string;
  servicio_id: string;
  clase: 'NOMINAL' | 'OPERATIVA';
  inicio: string;
  fin: string | null;
}
interface ProgramRow extends QueryResultRow {
  programacion_id: string;
  empleado_id: string;
  servicio_id: string;
  horario_id: string | null;
  turno_codigo: string | null;
  inicio_programado: Date;
  fin_programado: Date;
  estado: string;
}
interface DashboardRow extends QueryResultRow {
  jornadas: number;
  empleados_programados: number;
  programadas: number;
  canceladas: number;
  sustituidas: number;
  cerradas: number;
  horas_persona_programadas: number;
}
const staff = (r: StaffRow) => ({
  empleadoId: r.empleado_id,
  nombres: r.nombres,
  primerApellido: r.primer_apellido,
  activo: r.activo,
});
function page<R, T>(
  rows: R[],
  limit: number,
  id: (r: R) => string,
  map: (r: R) => T,
) {
  const items = rows.slice(0, limit);
  return {
    items: items.map(map),
    nextCursor: rows.length > limit ? id(items.at(-1)!) : null,
    limit,
    order: 'id:asc' as const,
  };
}
const assignmentPage = (rows: AssignmentRow[], limit: number) =>
  page(
    rows,
    limit,
    (r) => r.adscripcion_id,
    (r) => ({
      adscripcionId: r.adscripcion_id,
      contratoId: r.contrato_id,
      servicioId: r.servicio_id,
      clase: r.clase,
      inicio: r.inicio,
      fin: r.fin,
    }),
  );
function scope(
  p: Principal,
  permission: string,
  q: StaffReadQueryDto | ReadWindowDto,
) {
  return [
    p.usuarioId,
    permission,
    q.hospitalId,
    q.servicioId,
    q.divisionId ?? null,
  ];
}
@Injectable()
export class ReadRepository {
  constructor(private readonly db: PostgresService) {}
  async staff(
    p: Principal,
    permission: string,
    q: StaffReadQueryDto,
  ): Promise<EmployeePageDto> {
    const r = await this.db.query<StaffRow>(STAFF_LIST_SQL, [
      ...scope(p, permission, q),
      q.fecha,
      q.cursor ?? null,
      q.limit + 1,
    ]);
    return page(r.rows, q.limit, (r) => r.empleado_id, staff);
  }
  async detail(
    p: Principal,
    permission: string,
    q: StaffReadQueryDto,
    employeeId: string,
  ): Promise<EmployeeDetailDto> {
    return this.db.withTransaction(
      async (c: PoolClient) => {
        const params = [...scope(p, permission, q), q.fecha, employeeId];
        const r = await c.query<StaffRow>(STAFF_DETAIL_SQL, params);
        if (!r.rows[0]) throw new NotFoundException('Empleado no disponible');
        const a = await c.query<AssignmentRow>(EMPLOYEE_ASSIGNMENTS_SQL, [
          ...params,
          q.cursor ?? null,
          q.limit + 1,
        ]);
        return {
          empleado: staff(r.rows[0]),
          adscripciones: assignmentPage(a.rows, q.limit),
        };
      },
      { readOnly: true },
    );
  }
  async assignments(
    p: Principal,
    permission: string,
    q: StaffReadQueryDto,
    contractId: string,
  ): Promise<AssignmentPageDto> {
    const r = await this.db.query<AssignmentRow>(CONTRACT_ASSIGNMENTS_SQL, [
      ...scope(p, permission, q),
      q.fecha,
      contractId,
      q.cursor ?? null,
      q.limit + 1,
    ]);
    return assignmentPage(r.rows, q.limit);
  }
  async schedule(
    p: Principal,
    permission: string,
    q: ScheduleReadQueryDto,
  ): Promise<SchedulePageDto> {
    const r = await this.db.query<ProgramRow>(PROGRAM_LIST_SQL, [
      ...scope(p, permission, q),
      q.desde,
      q.hasta,
      q.cursor ?? null,
      q.limit + 1,
    ]);
    return page(
      r.rows,
      q.limit,
      (r) => r.programacion_id,
      (r) => ({
        programacionId: r.programacion_id,
        empleadoId: r.empleado_id,
        servicioId: r.servicio_id,
        horarioId: r.horario_id,
        turnoCodigo: r.turno_codigo,
        inicioProgramado: r.inicio_programado.toISOString(),
        finProgramado: r.fin_programado.toISOString(),
        estado: r.estado,
      }),
    );
  }
  async dashboard(
    p: Principal,
    permission: string,
    q: ReadWindowDto,
  ): Promise<ProgrammingDashboardDto> {
    const r = await this.db.query<DashboardRow>(DASHBOARD_SQL, [
      ...scope(p, permission, q),
      q.desde,
      q.hasta,
    ]);
    const v = r.rows[0]!;
    return {
      base: 'PROGRAMACION_NO_ASISTENCIA_NI_COBERTURA',
      jornadas: v.jornadas,
      empleadosProgramados: v.empleados_programados,
      programadas: v.programadas,
      canceladas: v.canceladas,
      sustituidas: v.sustituidas,
      cerradas: v.cerradas,
      horasPersonaProgramadas: v.horas_persona_programadas,
    };
  }
}
