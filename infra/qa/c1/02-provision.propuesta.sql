-- NO EJECUTADO. C2 BLOQUEADA por HBA trust; requiere nueva autorización.
-- psql -X -v ON_ERROR_STOP=1. No endurece roles preexistentes ni revoca PUBLIC.
BEGIN;
DO $c1$
BEGIN
 IF current_database() <> 'sigeh_qa' OR session_user <> 'sigeh_qa_bootstrap'
    OR current_setting('server_version_num')::int / 10000 <> 17 THEN
  RAISE EXCEPTION 'Destino o administrador C1 incorrecto';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sigeh_qa_app') THEN
  RAISE EXCEPTION 'Rol preexistente: auditar, no sobrescribir';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_hba_file_rules WHERE auth_method='trust' OR error IS NOT NULL) THEN
  RAISE EXCEPTION 'HBA pendiente: detener C2';
 END IF;
 -- Sin deny ACL: permisos PUBLIC se suman a los del rol nuevo.
 IF EXISTS (SELECT 1 FROM pg_database d,
  LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
  WHERE a.grantee=0 AND
   ((d.datname <> 'sigeh_qa' AND a.privilege_type='CONNECT') OR
    (d.datname='sigeh_qa' AND a.privilege_type IN ('CREATE','TEMPORARY')))) THEN
  RAISE EXCEPTION 'PUBLIC de bases pendiente de revision de impacto';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_namespace n,
  LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE a.grantee=0 AND a.privilege_type='CREATE') THEN
  RAISE EXCEPTION 'Esquema creable via PUBLIC';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
  LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND a.grantee=0) THEN
  RAISE EXCEPTION 'Acceso PUBLIC a relaciones: revisar antes de provisionar';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')) THEN
  RAISE EXCEPTION 'SECURITY DEFINER requiere revision individual';
 END IF;
END $c1$;
CREATE ROLE sigeh_qa_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
GRANT CONNECT ON DATABASE sigeh_qa TO sigeh_qa_app;
GRANT USAGE ON SCHEMA sigeh TO sigeh_qa_app;
ALTER ROLE sigeh_qa_app IN DATABASE sigeh_qa SET search_path = pg_catalog, sigeh, pg_temp;
ALTER ROLE sigeh_qa_app IN DATABASE sigeh_qa SET default_transaction_read_only = on;
-- Read-only es defensa operativa modificable por el cliente; NO sustituye ACL.
-- Cero grants de tablas, columnas, secuencias o rutinas; cero defaults nuevos.
COMMIT;
-- LOGIN sin password no autentica con SCRAM hasta aprovisionamiento separado.
