-- NO EJECUTADO. Requiere nueva autorización y revisar sesiones/dependencias de cluster.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sigeh_qa' OR session_user<>'sigeh_qa_bootstrap' THEN
  RAISE EXCEPTION 'Destino incorrecto'; END IF;
 IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename='sigeh_qa_app') THEN
  RAISE EXCEPTION 'Cerrar pool app antes del rollback, sin terminar sesiones automaticamente'; END IF;
 IF EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
  AND refobjid='sigeh_qa_app'::regrole AND deptype='o') THEN
  RAISE EXCEPTION 'Ownership inesperado; rollback manual'; END IF;
END $$;
REVOKE CONNECT ON DATABASE sigeh_qa FROM sigeh_qa_app;
REVOKE USAGE ON SCHEMA sigeh FROM sigeh_qa_app;
ALTER ROLE sigeh_qa_app IN DATABASE sigeh_qa RESET ALL;
DROP ROLE sigeh_qa_app; -- RESTRICT implícito: aborta si quedan dependencias; nunca CASCADE/DROP OWNED.
COMMIT;
-- No restaura PUBLIC ni HBA a trust. Restaurar únicamente ACL capturadas y autorizadas,
-- sin ampliar permisos globales. No volver a configurar bootstrap en la API.
