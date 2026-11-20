import { AUTHORIZED_SCOPES_CTE } from '../iam/infrastructure/authorization-sql.js';
// Same IAM ancestry/encargo predicates, evaluated at each statement after lock waits.
// $1 actor, $2 allowed permission codes, $3 session; remaining params per statement.
export const ATTENDANCE_AUTH = AUTHORIZED_SCOPES_CTE.replace(
  'SELECT DISTINCT ur.hospital_id,',
  'SELECT DISTINCT p.codigo AS permission, ur.hospital_id,',
)
  .replace('p.codigo = $2', 'p.codigo = ANY($2::text[])')
  .replaceAll('CURRENT_TIMESTAMP', 'statement_timestamp()');
export const SESSION_SQL = `SELECT EXISTS(SELECT 1 FROM sigeh.sesiones_usuario se
 JOIN sigeh.usuarios u ON u.usuario_id=se.usuario_id AND u.activo
 WHERE se.sesion_id=$3::uuid AND se.usuario_id=$1::uuid AND $2::text[] IS NOT NULL AND se.revocada_en IS NULL
 AND se.expira_en>statement_timestamp() AND se.inactiva_en>statement_timestamp()) AS active`;
const SESSION_PREDICATE = `EXISTS(SELECT 1 FROM sigeh.sesiones_usuario se
 WHERE se.sesion_id=$3::uuid AND se.usuario_id=$1::uuid AND se.revocada_en IS NULL
 AND se.expira_en>statement_timestamp() AND se.inactiva_en>statement_timestamp())`;
const SCOPE = `EXISTS(SELECT 1 FROM authorized_scopes a WHERE a.hospital_id=s.hospital_id
 AND (a.division_id IS NULL OR a.division_id=s.division_id)
 AND (a.servicio_id IS NULL OR a.servicio_id=s.servicio_id))`;
const CAPTURE_SCOPE = SCOPE.replace(
  'WHERE a.hospital_id=',
  "WHERE a.permission='ASISTENCIA_CAPTURAR' AND a.hospital_id=",
);
const CONTEXT = `FROM sigeh.servicios s JOIN sigeh.hospitales h ON h.hospital_id=s.hospital_id AND h.activo
 JOIN sigeh.divisiones d ON d.division_id=s.division_id AND d.hospital_id=h.hospital_id AND d.activo`;
export const CONTEXT_SQL = `${ATTENDANCE_AUTH} SELECT h.zona_horaria ${CONTEXT}
 WHERE h.hospital_id=$4::uuid AND s.servicio_id=$5::uuid AND s.activo AND ${SCOPE} AND ${SESSION_PREDICATE}`;
const RESOURCE = `FROM sigeh.programacion_laboral p
 JOIN sigeh.servicios s ON s.servicio_id=p.servicio_id AND s.hospital_id=p.hospital_id AND s.activo
 JOIN sigeh.hospitales h ON h.hospital_id=s.hospital_id AND h.activo
 JOIN sigeh.divisiones d ON d.division_id=s.division_id AND d.hospital_id=h.hospital_id AND d.activo
 JOIN sigeh.empleados e ON e.empleado_id=p.empleado_id
 JOIN sigeh.contratos c ON c.contrato_id=p.contrato_id AND c.empleado_id=p.empleado_id AND c.hospital_id=p.hospital_id
 LEFT JOIN sigeh.horarios hr ON hr.horario_id=p.horario_id
 LEFT JOIN sigeh.registros_asistencia ra ON ra.programacion_id=p.programacion_id`;
const FIELDS = `p.programacion_id,p.hospital_id,p.servicio_id,p.empleado_id,e.nombres,e.primer_apellido,
 p.horario_id,hr.codigo AS turno_codigo,p.inicio_programado,p.fin_programado,p.estado AS programacion_estado,
 ra.asistencia_id,ra.estado AS asistencia_estado,ra.validacion,
 statement_timestamp()>=p.inicio_programado AND statement_timestamp()<p.fin_programado AS in_window,
 e.activo AND c.estado='ACTIVO' AND c.inicio<=(p.inicio_programado AT TIME ZONE h.zona_horaria)::date
 AND (c.fin IS NULL OR c.fin>=(p.inicio_programado AT TIME ZONE h.zona_horaria)::date) AS contract_active,
 EXISTS(SELECT 1 FROM sigeh.cierres_balance cb WHERE cb.hospital_id=p.hospital_id AND cb.servicio_id=p.servicio_id
 AND cb.inicio<p.fin_programado AND cb.fin>p.inicio_programado) AS closed,
 ${CAPTURE_SCOPE} AS can_capture`;
export const RESOURCE_SQL = `${ATTENDANCE_AUTH} SELECT ${FIELDS} ${RESOURCE}
 WHERE p.programacion_id=$4::uuid AND ${SCOPE} AND ${SESSION_PREDICATE}`;
export const LIST_SQL = `${ATTENDANCE_AUTH} SELECT ${FIELDS},
 (SELECT max(ev.evento_id)::text FROM sigeh.eventos_asistencia ev WHERE ev.asistencia_id=ra.asistencia_id) AS revision,
 cap.evento_id::text AS capture_event_id,cap.actor_id AS capture_actor_id,cap.ocurrido_en AS capture_time
 ${RESOURCE}
 LEFT JOIN LATERAL (SELECT ev.evento_id,ev.actor_id,ev.ocurrido_en FROM sigeh.eventos_asistencia ev
 WHERE ev.asistencia_id=ra.asistencia_id AND ev.clase='CAPTURA_INICIAL' AND ev.datos->>'schemaVersion'='1'
 ORDER BY ev.evento_id DESC LIMIT 1) cap ON true
 WHERE p.hospital_id=$4::uuid AND p.servicio_id=$5::uuid
 AND p.inicio_programado>=($6::date::timestamp AT TIME ZONE h.zona_horaria)
 AND p.inicio_programado<((($6::date+1)::timestamp) AT TIME ZONE h.zona_horaria)
 AND ($7::uuid IS NULL OR p.horario_id=$7::uuid) AND ($8::uuid IS NULL OR p.programacion_id>$8::uuid)
 AND ${SCOPE} AND ${SESSION_PREDICATE} ORDER BY p.programacion_id LIMIT $9`;
export const REPLAY_SQL = `SELECT ev.evento_id::text,ev.actor_id,ev.ocurrido_en,ev.datos,ra.asistencia_id
 FROM sigeh.eventos_asistencia ev JOIN sigeh.registros_asistencia ra ON ra.asistencia_id=ev.asistencia_id
 WHERE ra.programacion_id=$1::uuid AND ev.actor_id=$2::uuid AND ev.clase='CAPTURA_INICIAL'
 AND ev.datos->>'schemaVersion'='1' AND ev.datos->>'clientEventId'=$3 ORDER BY ev.evento_id LIMIT 2`;
// The final insertion repeats session, scope, eligibility and nonexistence in one statement.
export const INSERT_SQL = `${ATTENDANCE_AUTH} INSERT INTO sigeh.registros_asistencia(programacion_id,estado)
 SELECT p.programacion_id,$5 ${RESOURCE}
 WHERE p.programacion_id=$4::uuid AND ${SCOPE} AND ${SESSION_PREDICATE}
 AND ra.asistencia_id IS NULL AND p.estado='PROGRAMADA'
 AND statement_timestamp()>=p.inicio_programado AND statement_timestamp()<p.fin_programado
 AND e.activo AND c.estado='ACTIVO' AND c.inicio<=(p.inicio_programado AT TIME ZONE h.zona_horaria)::date
 AND (c.fin IS NULL OR c.fin>=(p.inicio_programado AT TIME ZONE h.zona_horaria)::date)
 AND NOT EXISTS(SELECT 1 FROM sigeh.cierres_balance cb WHERE cb.hospital_id=p.hospital_id
 AND cb.servicio_id=p.servicio_id AND cb.inicio<p.fin_programado AND cb.fin>p.inicio_programado)
 RETURNING asistencia_id`;
