import { Client } from 'pg';

/** Runs before workers/importing AppModule. Catalog reads only. No provisioning. */
export default async function setup(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionTimeoutMillis: 3000,
    options:
      '-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=1000',
    application_name: 'sigeh-b1-qa-preflight',
  });
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT
      current_database() AS database, current_user AS role,
      current_setting('transaction_read_only') AS read_only,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema,
      has_schema_privilege(current_user,'sigeh','CREATE') AS can_create_in_schema,
      has_schema_privilege(current_user,'sigeh','USAGE') AS schema_usage,
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
      EXISTS (SELECT 1 FROM pg_roles elevated WHERE
        (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolcreaterole)
        AND pg_has_role(current_user, elevated.oid, 'MEMBER')) AS elevated_membership,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='sigeh' AND c.relkind IN ('r','p')) AS tables,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='sigeh' AND c.relkind IN ('r','p') AND
        (has_table_privilege(current_user,c.oid,'INSERT') OR
         has_table_privilege(current_user,c.oid,'UPDATE') OR
         has_table_privilege(current_user,c.oid,'DELETE') OR
         has_table_privilege(current_user,c.oid,'TRUNCATE'))) AS can_write
      FROM pg_roles r WHERE r.rolname=current_user`);
    const row = rows[0];
    if (
      !row ||
      row.database !== 'sigeh_qa' ||
      row.role !== 'sigeh_qa_app' ||
      row.read_only !== 'on' ||
      row.can_create_schema !== false ||
      row.can_create_in_schema !== false ||
      row.schema_usage !== true ||
      row.tables !== 51 ||
      row.rolsuper !== false ||
      row.rolbypassrls !== false ||
      row.rolcreatedb !== false ||
      row.rolcreaterole !== false ||
      row.rolreplication !== false ||
      row.elevated_membership !== false ||
      row.can_write !== false
    )
      throw new Error('QA_PREFLIGHT_REJECTED');
  } catch {
    // Never print connection errors/DSN/password or institutional row content.
    throw new Error(
      'QA_PREFLIGHT_REJECTED: destino, rol o esquema no verificables para lectura aislada',
    );
  } finally {
    await client.end();
  }
}
