-- NO EJECUTADO. SOLO SELECT; ejecutar después de C2 con el rol app real, nunca SET ROLE bootstrap.
SELECT current_database()='sigeh_qa' AND session_user='sigeh_qa_app'
 AND current_user=session_user AS identidad_correcta;
SELECT 1 AS readiness;
SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='sigeh') AS schema_visible;
SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
 AND rolcanlogin AS atributos_correctos FROM pg_roles WHERE rolname=current_user;
SELECT NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=current_user::regrole
 OR roleid=current_user::regrole) AS sin_membresias;
SELECT NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
 AND refobjid=current_user::regrole AND deptype='o') AS sin_ownership_cluster;
SELECT datname,has_database_privilege(current_user,oid,'CONNECT') AS connect,
 has_database_privilege(current_user,oid,'CREATE') AS crear,
 has_database_privilege(current_user,oid,'TEMPORARY') AS temporal FROM pg_database;
SELECT nspname,has_schema_privilege(current_user,oid,'USAGE') AS uso,
 has_schema_privilege(current_user,oid,'CREATE') AS crear FROM pg_namespace;
-- Cada fila de violaciones debe desaparecer. Incluye SELECT de cualquier tabla de negocio.
SELECT n.nspname,c.relname,v.privilege FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(privilege)
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')
 AND has_table_privilege(current_user,c.oid,v.privilege);
SELECT n.nspname,c.relname,a.attname FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND a.attnum>0 AND NOT a.attisdropped
 AND (has_column_privilege(current_user,c.oid,a.attnum,'SELECT') OR
 has_column_privilege(current_user,c.oid,a.attnum,'INSERT') OR
 has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') OR
 has_column_privilege(current_user,c.oid,a.attnum,'REFERENCES'));
SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='S' AND (has_sequence_privilege(current_user,c.oid,'USAGE') OR
 has_sequence_privilege(current_user,c.oid,'SELECT') OR has_sequence_privilege(current_user,c.oid,'UPDATE'));
SELECT n.nspname,p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
 AND has_function_privilege(current_user,p.oid,'EXECUTE');
