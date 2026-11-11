-- PROPUESTA. NO EJECUTADA. Requiere autorización para crear rol/GRANT/ALTER ROLE.
-- Solo cluster QA nuevo, baseline previamente restaurada y autorizada. Sin password.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sigeh_qa' THEN RAISE EXCEPTION 'Solo QA explícita'; END IF;
END $$;
CREATE ROLE sigeh_qa_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE sigeh_qa TO sigeh_qa_app;
GRANT USAGE ON SCHEMA sigeh TO sigeh_qa_app;
GRANT SELECT ON TABLE sigeh.hospitales, sigeh.divisiones, sigeh.servicios, sigeh.subareas,
 sigeh.usuarios, sigeh.usuario_roles, sigeh.roles, sigeh.permisos, sigeh.rol_permisos TO sigeh_qa_app;
ALTER ROLE sigeh_qa_app SET default_transaction_read_only = on;
COMMIT;
-- Aprovisionar LOGIN/credencial externamente tras aprobación; nunca usar bootstrap en API.
-- No concede writes, ownership, BYPASSRLS, membership ni DDL sobre las 51 tablas.
