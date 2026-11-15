-- D1 PREPARADA, NO APLICADA. Ejecutar por propietario solo tras DDL V2 aprobada.
-- Capturar ACL antes/después para reversión exacta; no revocar PUBLIC ni otras bases.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sigeh_qa' OR session_user<>'sigeh_qa_bootstrap' OR current_user<>session_user
 OR current_setting('server_version_num')::int/10000<>17 THEN RAISE EXCEPTION 'Destino incorrecto'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sigeh_qa_app' AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
 RAISE EXCEPTION 'Rol app no apto'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole)
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o')
 THEN RAISE EXCEPTION 'Membresia/ownership app inesperado'; END IF;
 IF to_regclass('sigeh.auditoria_seguridad') IS NULL THEN RAISE EXCEPTION 'Falta DDL V2'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='sigeh'::regnamespace
 AND c.relkind IN ('r','v','p','m','f') AND
 (has_any_column_privilege('sigeh_qa_app',c.oid,'SELECT') OR
  has_any_column_privilege('sigeh_qa_app',c.oid,'INSERT') OR
  has_any_column_privilege('sigeh_qa_app',c.oid,'UPDATE') OR
  has_table_privilege('sigeh_qa_app',c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN'))) THEN
 RAISE EXCEPTION 'Grants previos: capturar/revisar, no ampliar automaticamente'; END IF;
END $$;
GRANT SELECT(usuario_id,identificador,activo) ON sigeh.usuarios TO sigeh_qa_app;
GRANT SELECT(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta)
 ON sigeh.usuario_roles TO sigeh_qa_app;
GRANT SELECT(rol_id) ON sigeh.roles TO sigeh_qa_app;
GRANT SELECT(rol_id,permiso_id) ON sigeh.rol_permisos TO sigeh_qa_app;
GRANT SELECT(permiso_id,codigo) ON sigeh.permisos TO sigeh_qa_app;
GRANT SELECT(hospital_id,activo) ON sigeh.hospitales TO sigeh_qa_app;
GRANT SELECT(division_id,hospital_id,activo) ON sigeh.divisiones TO sigeh_qa_app;
GRANT SELECT(servicio_id,division_id,hospital_id,activo) ON sigeh.servicios TO sigeh_qa_app;
GRANT SELECT(usuario_id,password_hash,algoritmo,requiere_cambio,intentos_fallidos,bloqueada_hasta) ON sigeh.usuario_credenciales TO sigeh_qa_app;
GRANT UPDATE(intentos_fallidos,bloqueada_hasta) ON sigeh.usuario_credenciales TO sigeh_qa_app;
GRANT SELECT ON sigeh.usuario_roles_contexto,sigeh.encargo_permisos TO sigeh_qa_app;
GRANT SELECT ON sigeh.sesiones_usuario TO sigeh_qa_app;
GRANT INSERT(sesion_id,usuario_id,creada_en,expira_en,ultima_actividad_en,inactiva_en)
 ON sigeh.sesiones_usuario TO sigeh_qa_app;
GRANT UPDATE(ultima_actividad_en,inactiva_en,revocada_en,motivo_revocacion)
 ON sigeh.sesiones_usuario TO sigeh_qa_app;
GRANT SELECT(token_id,sesion_id,token_hash,expira_en,consumido_en,revocado_en) ON sigeh.refresh_tokens_sesion TO sigeh_qa_app;
GRANT INSERT(token_id,sesion_id,token_hash,expira_en) ON sigeh.refresh_tokens_sesion TO sigeh_qa_app;
GRANT UPDATE(consumido_en,reemplazado_por,revocado_en) ON sigeh.refresh_tokens_sesion TO sigeh_qa_app;
GRANT SELECT ON sigeh.iam_limites_acceso TO sigeh_qa_app;
GRANT INSERT(clave_hash,ventana_desde,intentos),UPDATE(ventana_desde,intentos)
 ON sigeh.iam_limites_acceso TO sigeh_qa_app;
GRANT INSERT(evento,resultado,actor_usuario_id,objetivo_usuario_id,sesion_id,hospital_id,division_id,servicio_id)
 ON sigeh.auditoria_seguridad TO sigeh_qa_app;
-- Cero DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN, CREATE, secuencias o EXECUTE nuevos.
-- Sin UPDATE de hash, rol, permisos, vigencia, identidad, usuario activo o mandatos.
-- BEGIN READ WRITE de IAM opera solo tras estos grants; default read-only del rol no se altera.
COMMIT;
