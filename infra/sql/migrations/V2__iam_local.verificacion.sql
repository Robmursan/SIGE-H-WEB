-- D2.1-R: SOLO SELECT; no incluye ni ejecuta DDL, grants o rollback.
-- Ejecutar en sesión READ ONLY QA. Estado actual esperado: V2 presente, grants retirados.
SELECT current_database(),current_user,current_setting('server_version'),
 current_database()='sigeh_qa' AND current_user='sigeh_qa_bootstrap' AS destino_correcto;
-- Esperado: 58 tablas, 100 índices, 303 restricciones, 8 triggers de usuario, 0 inválidos.
SELECT
 (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r') AS tablas,
 (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='i') AS indices,
 (SELECT count(*) FROM pg_constraint WHERE connamespace='sigeh'::regnamespace) AS restricciones,
 (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal) AS triggers_usuario,
 (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  WHERE c.relnamespace='sigeh'::regnamespace AND (NOT i.indisvalid OR NOT i.indisready)) AS indices_invalidos;
SELECT conrelid::regclass,conname,convalidated FROM pg_constraint
 WHERE connamespace='sigeh'::regnamespace AND NOT convalidated;
SELECT c.relname,c.relacl FROM pg_class c WHERE c.relnamespace='sigeh'::regnamespace ORDER BY 1;
SELECT c.relname,a.attname,a.attacl FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE c.relnamespace='sigeh'::regnamespace AND a.attacl IS NOT NULL ORDER BY 1,2;
SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app';
SELECT n.nspname,c.relname,has_table_privilege('sigeh_qa_app',c.oid,'DELETE') AS can_delete,
 has_table_privilege('sigeh_qa_app',c.oid,'TRUNCATE') AS can_truncate
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='sigeh' AND c.relkind='r';
-- El WHERE/AND no garantiza orden de evaluación: CASE protege la llamada por fila.
-- Esperado: cuatro secuencias; todas con can_use=false tras rollback y futuros grants IAM.
SELECT c.oid,c.relname,
 CASE WHEN c.relkind='S' THEN
  has_sequence_privilege('sigeh_qa_app',c.oid,'USAGE,SELECT,UPDATE')
 ELSE false END AS can_use
 FROM pg_class c
 WHERE c.relnamespace='sigeh'::regnamespace AND c.relkind='S'
 ORDER BY c.oid;
-- Esperado actual: cero objetos con acceso efectivo de datos (58 tablas y una vista).
SELECT count(*) AS objetos_con_permisos_datos
 FROM pg_class c WHERE c.relnamespace='sigeh'::regnamespace AND
 CASE WHEN c.relkind IN ('r','v','m','f','p') THEN
  has_any_column_privilege('sigeh_qa_app',c.oid,'SELECT,INSERT,UPDATE') OR
  has_table_privilege('sigeh_qa_app',c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
 ELSE false END;
-- No leer credenciales, sesiones, tokens ni auditoría: únicamente contar filas.
-- Esperado: siete resultados, todos cero; tablas ausentes producen error, no PASS vacío.
SELECT 'usuario_credenciales' AS objeto,count(*) AS filas FROM sigeh.usuario_credenciales
UNION ALL SELECT 'sesiones_usuario',count(*) FROM sigeh.sesiones_usuario
UNION ALL SELECT 'refresh_tokens_sesion',count(*) FROM sigeh.refresh_tokens_sesion
UNION ALL SELECT 'iam_limites_acceso',count(*) FROM sigeh.iam_limites_acceso
UNION ALL SELECT 'usuario_roles_contexto',count(*) FROM sigeh.usuario_roles_contexto
UNION ALL SELECT 'encargo_permisos',count(*) FROM sigeh.encargo_permisos
UNION ALL SELECT 'auditoria_seguridad',count(*) FROM sigeh.auditoria_seguridad;
-- Esperado actual tras rollback: false en las siete columnas.
-- Tras grants autorizados: true,true,true,false,false,false,false. No aplicarlos aquí.
-- Locks/replay/concurrencia/COMMIT incierto con datos siguen pendientes D2.2/D3.
SELECT has_column_privilege('sigeh_qa_app','sigeh.sesiones_usuario','sesion_id','INSERT') AS session_insert,
 has_column_privilege('sigeh_qa_app','sigeh.refresh_tokens_sesion','token_hash','INSERT') AS refresh_insert,
 has_column_privilege('sigeh_qa_app','sigeh.auditoria_seguridad','evento','INSERT') AS audit_append,
 has_table_privilege('sigeh_qa_app','sigeh.auditoria_seguridad','SELECT') AS audit_read,
 has_column_privilege('sigeh_qa_app','sigeh.usuario_credenciales','password_hash','UPDATE') AS password_change,
 has_column_privilege('sigeh_qa_app','sigeh.usuarios','activo','UPDATE') AS account_change,
 has_column_privilege('sigeh_qa_app','sigeh.usuario_roles_contexto','tipo','UPDATE') AS mandate_change;
