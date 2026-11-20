-- L3A PROPUESTA NO EJECUTADA. Requiere nueva autorizacion especifica.
-- Antes de este archivo, en la misma sesion y solo tras revisar el snapshot:
-- SET sigeh.l3a_baseline_reviewed='EMPTY_FIVE_TABLES_NO_LATER_GRANTS';
-- psql -X -v ON_ERROR_STOP=1, bootstrap QA; nunca un runner de migraciones.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $l3a$ BEGIN
 IF current_database()<>'sigeh_qa' OR session_user<>'sigeh_qa_bootstrap' OR current_user<>session_user
 OR current_setting('server_version_num')::int/10000<>17
 OR (SELECT system_identifier::text FROM pg_control_system())<>'7707094012630982690' THEN RAISE EXCEPTION 'Destino/identidad L3A incorrectos'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sigeh_qa_app' AND rolcanlogin AND NOT rolsuper AND NOT rolinherit
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole)
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o')
 THEN RAISE EXCEPTION 'Rol app/membresias/ownership no aptos'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r')<>58
 OR (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='i')<>100
 OR (SELECT count(*) FROM pg_constraint WHERE connamespace='sigeh'::regnamespace)<>303
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='sigeh'::regnamespace AND NOT convalidated)
 THEN RAISE EXCEPTION 'Inventario QA divergente'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='sigeh_qa_app')
 THEN RAISE EXCEPTION 'Cerrar pools app por procedimiento autorizado antes de cambiar ACL'; END IF;
 IF (SELECT count(*) FROM (VALUES ('empleados','empleado_id'),
 ('empleados','nombres'),
 ('empleados','primer_apellido'),
 ('empleados','activo'),
 ('contratos','contrato_id'),
 ('contratos','empleado_id'),
 ('contratos','hospital_id'),
 ('contratos','inicio'),
 ('contratos','fin'),
 ('contratos','estado'),
 ('adscripciones','adscripcion_id'),
 ('adscripciones','contrato_id'),
 ('adscripciones','servicio_id'),
 ('adscripciones','clase'),
 ('adscripciones','inicio'),
 ('adscripciones','fin'),
 ('programacion_laboral','programacion_id'),
 ('programacion_laboral','empleado_id'),
 ('programacion_laboral','contrato_id'),
 ('programacion_laboral','hospital_id'),
 ('programacion_laboral','servicio_id'),
 ('programacion_laboral','horario_id'),
 ('programacion_laboral','inicio_programado'),
 ('programacion_laboral','fin_programado'),
 ('programacion_laboral','estado'),
 ('horarios','horario_id'),
 ('horarios','codigo')) AS expected(tab,col)
 JOIN pg_class c ON c.relnamespace='sigeh'::regnamespace AND c.relname=expected.tab AND c.relkind='r'
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=expected.col AND a.attnum>0 AND NOT a.attisdropped
 WHERE c.relowner='sigeh_qa_bootstrap'::regrole)<>27
 THEN RAISE EXCEPTION 'Columnas/propietarios L3A no coinciden'; END IF;
 IF current_setting('sigeh.l3a_baseline_reviewed',true) IS DISTINCT FROM 'EMPTY_FIVE_TABLES_NO_LATER_GRANTS'
 THEN RAISE EXCEPTION 'Rollback requiere revisar snapshot inicial vacio y ausencia de grants legitimos posteriores'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.relnamespace='sigeh'::regnamespace AND c.relname IN ('empleados','contratos','adscripciones','programacion_laboral','horarios') AND a.grantee='sigeh_qa_app'::regrole)
 THEN RAISE EXCEPTION 'Grant de tabla inesperado: rollback manual'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_attribute att ON att.attrelid=c.oid
 CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE c.relnamespace='sigeh'::regnamespace AND c.relname IN ('empleados','contratos','adscripciones','programacion_laboral','horarios')
 AND a.grantee='sigeh_qa_app'::regrole)<>27
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_attribute att ON att.attrelid=c.oid
 CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE c.relnamespace='sigeh'::regnamespace AND c.relname IN ('empleados','contratos','adscripciones','programacion_laboral','horarios')
 AND a.grantee='sigeh_qa_app'::regrole AND (a.privilege_type<>'SELECT' OR a.is_grantable
 OR a.grantor<>'sigeh_qa_bootstrap'::regrole OR NOT EXISTS(SELECT 1 FROM (VALUES ('empleados','empleado_id'),
 ('empleados','nombres'),
 ('empleados','primer_apellido'),
 ('empleados','activo'),
 ('contratos','contrato_id'),
 ('contratos','empleado_id'),
 ('contratos','hospital_id'),
 ('contratos','inicio'),
 ('contratos','fin'),
 ('contratos','estado'),
 ('adscripciones','adscripcion_id'),
 ('adscripciones','contrato_id'),
 ('adscripciones','servicio_id'),
 ('adscripciones','clase'),
 ('adscripciones','inicio'),
 ('adscripciones','fin'),
 ('programacion_laboral','programacion_id'),
 ('programacion_laboral','empleado_id'),
 ('programacion_laboral','contrato_id'),
 ('programacion_laboral','hospital_id'),
 ('programacion_laboral','servicio_id'),
 ('programacion_laboral','horario_id'),
 ('programacion_laboral','inicio_programado'),
 ('programacion_laboral','fin_programado'),
 ('programacion_laboral','estado'),
 ('horarios','horario_id'),
 ('horarios','codigo')) expected(tab,col)
 WHERE expected.tab=c.relname AND expected.col=att.attname)))
 THEN RAISE EXCEPTION 'Delta ACL divergente: no revocar permisos ajenos'; END IF;
END $l3a$;
REVOKE SELECT(empleado_id,nombres,primer_apellido,activo) ON sigeh.empleados FROM sigeh_qa_app;
REVOKE SELECT(contrato_id,empleado_id,hospital_id,inicio,fin,estado) ON sigeh.contratos FROM sigeh_qa_app;
REVOKE SELECT(adscripcion_id,contrato_id,servicio_id,clase,inicio,fin) ON sigeh.adscripciones FROM sigeh_qa_app;
REVOKE SELECT(programacion_id,empleado_id,contrato_id,hospital_id,servicio_id,horario_id,inicio_programado,fin_programado,estado) ON sigeh.programacion_laboral FROM sigeh_qa_app;
REVOKE SELECT(horario_id,codigo) ON sigeh.horarios FROM sigeh_qa_app;
COMMIT;
RESET sigeh.l3a_baseline_reviewed;
-- Revertir solo este delta; conservar grants IAM/ORG y datos, sin CASCADE.
