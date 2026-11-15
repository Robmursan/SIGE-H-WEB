-- D1 PREPARADA, NO EJECUTADA. Conservar tablas y auditoría, retirar únicamente grants D1.
-- Precondiciones: IAM_V2_ENABLED=false, pools cerrados, snapshot de ACL revisado y
-- ausencia de grants legítimos posteriores que coincidan con esta lista.
-- El DBA debe revisar el snapshot y establecer en la misma sesión, ANTES del archivo:
-- SET sigeh.iam_rollback_reviewed='D1_V2_QA'; (marcador de sesión, no autorización implícita).
-- Sin ese marcador, este archivo ABORTA y no altera permisos.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sigeh_qa' OR session_user<>'sigeh_qa_bootstrap' OR current_user<>session_user
 OR current_setting('sigeh.iam_rollback_reviewed',true) IS DISTINCT FROM 'D1_V2_QA'
 THEN RAISE EXCEPTION 'Rollback requiere revision explicita QA/snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='sigeh_qa_app') THEN
 RAISE EXCEPTION 'Cerrar pools app antes de retirar privilegios'; END IF;
END $$;
REVOKE SELECT(usuario_id,identificador,activo) ON sigeh.usuarios FROM sigeh_qa_app;
REVOKE SELECT(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta)
 ON sigeh.usuario_roles FROM sigeh_qa_app;
REVOKE SELECT(rol_id) ON sigeh.roles FROM sigeh_qa_app;
REVOKE SELECT(rol_id,permiso_id) ON sigeh.rol_permisos FROM sigeh_qa_app;
REVOKE SELECT(permiso_id,codigo) ON sigeh.permisos FROM sigeh_qa_app;
REVOKE SELECT(hospital_id,activo) ON sigeh.hospitales FROM sigeh_qa_app;
REVOKE SELECT(division_id,hospital_id,activo) ON sigeh.divisiones FROM sigeh_qa_app;
REVOKE SELECT(servicio_id,division_id,hospital_id,activo) ON sigeh.servicios FROM sigeh_qa_app;
REVOKE SELECT(usuario_id,password_hash,algoritmo,requiere_cambio,intentos_fallidos,bloqueada_hasta) ON sigeh.usuario_credenciales FROM sigeh_qa_app;
REVOKE UPDATE(intentos_fallidos,bloqueada_hasta) ON sigeh.usuario_credenciales FROM sigeh_qa_app;
REVOKE SELECT ON sigeh.usuario_roles_contexto,sigeh.encargo_permisos FROM sigeh_qa_app;
REVOKE SELECT ON sigeh.sesiones_usuario FROM sigeh_qa_app;
REVOKE INSERT(sesion_id,usuario_id,creada_en,expira_en,ultima_actividad_en,inactiva_en)
 ON sigeh.sesiones_usuario FROM sigeh_qa_app;
REVOKE UPDATE(ultima_actividad_en,inactiva_en,revocada_en,motivo_revocacion)
 ON sigeh.sesiones_usuario FROM sigeh_qa_app;
REVOKE SELECT(token_id,sesion_id,token_hash,expira_en,consumido_en,revocado_en) ON sigeh.refresh_tokens_sesion FROM sigeh_qa_app;
REVOKE INSERT(token_id,sesion_id,token_hash,expira_en) ON sigeh.refresh_tokens_sesion FROM sigeh_qa_app;
REVOKE UPDATE(consumido_en,reemplazado_por,revocado_en) ON sigeh.refresh_tokens_sesion FROM sigeh_qa_app;
REVOKE SELECT ON sigeh.iam_limites_acceso FROM sigeh_qa_app;
REVOKE INSERT(clave_hash,ventana_desde,intentos),UPDATE(ventana_desde,intentos)
 ON sigeh.iam_limites_acceso FROM sigeh_qa_app;
REVOKE INSERT(evento,resultado,actor_usuario_id,objetivo_usuario_id,sesion_id,hospital_id,division_id,servicio_id)
 ON sigeh.auditoria_seguridad FROM sigeh_qa_app;
-- No revocar CONNECT/USAGE C2.2 ni alterar PUBLIC, default privileges o role settings.
-- Sin DROP, CASCADE, borrado, desactivación de constraints ni pérdida de trazabilidad.
COMMIT;
RESET sigeh.iam_rollback_reviewed;
