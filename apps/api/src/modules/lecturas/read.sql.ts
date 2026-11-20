import { AUTHORIZED_SCOPES_CTE } from '../iam/infrastructure/authorization-sql.js';

// Every statement revalidates the persisted permission/mandate and actual ancestry.
// $1 actor, $2 permission, $3 hospital, $4 service, $5 division, $6 fecha/desde,
// $7 hasta (window only), $8 resource ID/cursor, $9 cursor/limit, $10 limit.
const SCOPE = `
 JOIN sigeh.servicios s ON s.servicio_id=$4::uuid AND s.hospital_id=$3::uuid AND s.activo
 JOIN sigeh.divisiones d ON d.division_id=s.division_id AND d.hospital_id=s.hospital_id AND d.activo
 WHERE ($5::uuid IS NULL OR d.division_id=$5::uuid)
 AND EXISTS(SELECT 1 FROM authorized_scopes a WHERE a.hospital_id=s.hospital_id
   AND (a.division_id IS NULL OR a.division_id=d.division_id)
   AND (a.servicio_id IS NULL OR a.servicio_id=s.servicio_id))`;
const STAFF_BASE = `FROM sigeh.empleados e
 JOIN sigeh.contratos c ON c.empleado_id=e.empleado_id AND c.hospital_id=$3::uuid
 JOIN sigeh.adscripciones ad ON ad.contrato_id=c.contrato_id AND ad.servicio_id=$4::uuid
 ${SCOPE}
 AND e.activo AND c.estado='ACTIVO'
 AND c.inicio<=$6::date AND (c.fin IS NULL OR c.fin>=$6::date)
 AND ad.inicio<=$6::date AND (ad.fin IS NULL OR ad.fin>=$6::date)`;
const EMPLOYEE_COLUMNS = 'e.empleado_id,e.nombres,e.primer_apellido,e.activo';
export const STAFF_LIST_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT DISTINCT ${EMPLOYEE_COLUMNS} ${STAFF_BASE}
 AND ($7::uuid IS NULL OR e.empleado_id>$7::uuid) ORDER BY e.empleado_id LIMIT $8`;
export const STAFF_DETAIL_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT DISTINCT ${EMPLOYEE_COLUMNS} ${STAFF_BASE} AND e.empleado_id=$7::uuid`;
const ASSIGNMENT_COLUMNS = `ad.adscripcion_id,ad.contrato_id,ad.servicio_id,ad.clase,
 to_char(ad.inicio,'YYYY-MM-DD') AS inicio,to_char(ad.fin,'YYYY-MM-DD') AS fin`;
export const EMPLOYEE_ASSIGNMENTS_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT ${ASSIGNMENT_COLUMNS} ${STAFF_BASE} AND e.empleado_id=$7::uuid
 AND ($8::uuid IS NULL OR ad.adscripcion_id>$8::uuid) ORDER BY ad.adscripcion_id LIMIT $9`;
export const CONTRACT_ASSIGNMENTS_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT ${ASSIGNMENT_COLUMNS} ${STAFF_BASE} AND c.contrato_id=$7::uuid
 AND ($8::uuid IS NULL OR ad.adscripcion_id>$8::uuid) ORDER BY ad.adscripcion_id LIMIT $9`;
const PROGRAM_BASE = `FROM sigeh.programacion_laboral p
 JOIN sigeh.contratos c ON c.contrato_id=p.contrato_id AND c.empleado_id=p.empleado_id AND c.hospital_id=p.hospital_id
 ${SCOPE}
 AND p.hospital_id=s.hospital_id AND p.servicio_id=s.servicio_id
 AND p.inicio_programado<$7::timestamptz AND p.fin_programado>$6::timestamptz`;
export const PROGRAM_LIST_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT p.programacion_id,p.empleado_id,p.servicio_id,p.horario_id,
 (SELECT h.codigo FROM sigeh.horarios h WHERE h.horario_id=p.horario_id) AS turno_codigo,
 p.inicio_programado,p.fin_programado,p.estado ${PROGRAM_BASE}
 AND ($8::uuid IS NULL OR p.programacion_id>$8::uuid) ORDER BY p.programacion_id LIMIT $9`;
export const DASHBOARD_SQL = `${AUTHORIZED_SCOPES_CTE}
 SELECT count(p.programacion_id)::int AS jornadas,count(DISTINCT p.empleado_id)::int AS empleados_programados,
 count(p.programacion_id) FILTER(WHERE p.estado='PROGRAMADA')::int AS programadas,
 count(p.programacion_id) FILTER(WHERE p.estado='CANCELADA')::int AS canceladas,
 count(p.programacion_id) FILTER(WHERE p.estado='SUSTITUIDA')::int AS sustituidas,
 count(p.programacion_id) FILTER(WHERE p.estado='CERRADA')::int AS cerradas,
 COALESCE(sum(extract(epoch FROM (LEAST(p.fin_programado,$7::timestamptz)-GREATEST(p.inicio_programado,$6::timestamptz)))/3600)
 FILTER(WHERE p.estado IN ('PROGRAMADA','CERRADA')),0)::float8 AS horas_persona_programadas
 ${PROGRAM_BASE}`;
