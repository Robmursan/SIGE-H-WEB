-- ONLY a fresh isolated cluster: runner validates Docker ownership + cluster first.
-- NOT a package authorized for usual QA. Explicit column permissions for ASI SQL.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $$ BEGIN
 IF current_database()<>'sigeh_qa' OR current_user<>'sigeh_qa_bootstrap'
 OR (SELECT system_identifier::text FROM pg_control_system())='7707094012630982690'
 THEN RAISE EXCEPTION 'Not an ephemeral ASI target'; END IF;
END $$;
GRANT SELECT(zona_horaria) ON sigeh.hospitales TO sigeh_qa_app;
GRANT SELECT(empleado_id,nombres,primer_apellido,activo) ON sigeh.empleados TO sigeh_qa_app;
GRANT SELECT(contrato_id,empleado_id,hospital_id,estado,inicio,fin) ON sigeh.contratos TO sigeh_qa_app;
GRANT SELECT(programacion_id,contrato_id,empleado_id,hospital_id,servicio_id,horario_id,inicio_programado,fin_programado,estado)
 ON sigeh.programacion_laboral TO sigeh_qa_app;
GRANT SELECT(horario_id,codigo) ON sigeh.horarios TO sigeh_qa_app;
GRANT SELECT(asistencia_id,programacion_id,estado,validacion), INSERT(programacion_id,estado)
 ON sigeh.registros_asistencia TO sigeh_qa_app;
GRANT SELECT(evento_id,asistencia_id,clase,ocurrido_en,actor_id,datos),
 INSERT(asistencia_id,clase,actor_id,datos,ocurrido_en) ON sigeh.eventos_asistencia TO sigeh_qa_app;
GRANT SELECT(hospital_id,servicio_id,inicio,fin) ON sigeh.cierres_balance TO sigeh_qa_app;
GRANT INSERT(hospital_id,tabla,registro_id,accion,actor_id,anterior,nuevo) ON sigeh.auditoria_general TO sigeh_qa_app;
-- Identity columns do not require sequence USAGE for this INSERT form; prove at runtime.
-- No sequence grants, UPDATE/DELETE of attendance/history, schema CREATE or GRANT ALL.
COMMIT;
