// Final review only: reads code/artifacts and optionally QA catalogs. No GRANT/REVOKE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const check = (b, code) => {
  if (!b) throw Error(code);
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
const manifest = JSON.parse(
  fs.readFileSync(root + "/infra/sql/privileges/L3A__lecturas.manifest.json"),
);
check(
  manifest.database === "sigeh_qa" &&
    manifest.schema === "sigeh" &&
    manifest.role === "sigeh_qa_app",
  "manifest_destination",
);
const grantPath = "infra/sql/privileges/L3A__lecturas-qa.propuesta.sql",
  rollbackPath = "infra/sql/privileges/L3A__lecturas-qa.rollback.propuesta.sql";
const hashes = {};
for (const p of [
  grantPath,
  rollbackPath,
  "infra/sql/privileges/L3A__lecturas.manifest.json",
  "artifacts/permissions/l3a-lecturas.csv",
  "artifacts/openapi/sigeh-v1.json",
]) {
  const bytes = fs.readFileSync(root + "/" + p);
  hashes[p] = hash(bytes);
  if (p.endsWith(".sql"))
    check(
      !/sigeh_db|sigeh_postgres|docker_sigeh_pgdata|GRANT ALL|ALTER DEFAULT PRIVILEGES/.test(
        bytes.toString(),
      ),
      "foreign_destination_or_excessive_grant",
    );
}
const queries = await import(
  root + "/apps/api/dist/modules/lecturas/read.sql.js"
);
const { AUTHORIZED_SCOPES_CTE } = await import(
  root + "/apps/api/dist/modules/iam/infrastructure/authorization-sql.js"
);
const alias = {
  e: "empleados",
  c: "contratos",
  ad: "adscripciones",
  p: "programacion_laboral",
  h: "horarios",
};
const expected = Object.entries(manifest.tables)
  .flatMap(([t, cols]) => cols.map((c) => t + "." + c))
  .sort();
check(
  expected.length === 27 && new Set(expected).size === 27,
  "requested_delta",
);
const used = new Set(),
  perQuery = {};
for (const [name, text] of Object.entries(queries)) {
  check(text.startsWith(AUTHORIZED_SCOPES_CTE), "authorization_cte_missing");
  const body = text.slice(AUTHORIZED_SCOPES_CTE.length);
  check(!/SELECT\s+\w*\.?\*/i.test(body), "whole_row_projection");
  const refs = [...body.matchAll(/\b(e|c|ad|p|h)\.([a-z_]+)\b/g)].map(
    (m) => alias[m[1]] + "." + m[2],
  );
  perQuery[name] = [...new Set(refs)].sort();
  for (const r of refs) used.add(r);
}
check(
  JSON.stringify([...used].sort()) === JSON.stringify(expected),
  "queries_manifest_mismatch",
);
// The CSV contains no quoted commas in any field; all cells here are fixed identifiers.
const csv = fs
  .readFileSync(root + "/artifacts/permissions/l3a-lecturas.csv", "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((x) => x.split(","));
const endpointQueries = {
  "GET /api/v1/empleados": ["STAFF_LIST_SQL"],
  "GET /api/v1/empleados/{empleadoId}": [
    "STAFF_DETAIL_SQL",
    "EMPLOYEE_ASSIGNMENTS_SQL",
  ],
  "GET /api/v1/contratos/{contratoId}/adscripciones": [
    "CONTRACT_ASSIGNMENTS_SQL",
  ],
  "GET /api/v1/programaciones": ["PROGRAM_LIST_SQL"],
  "GET /api/v1/tableros/coordinacion": ["DASHBOARD_SQL"],
};
for (const [endpoint, names] of Object.entries(endpointQueries)) {
  const needed = [...new Set(names.flatMap((n) => perQuery[n]))].sort();
  const recorded = [
    ...new Set(
      csv
        .filter((row) => row[0] === endpoint)
        .map((row) => row[1].replace("sigeh.", "") + "." + row[2]),
    ),
  ].sort();
  check(
    JSON.stringify(needed) === JSON.stringify(recorded),
    "endpoint_csv_mismatch",
  );
}
const result = {
  status: "PASS_OFFLINE",
  hashes,
  query_columns: perQuery,
  delta_columns: 27,
  qa_catalogs: "NOT_RUN",
};
let owner;
try {
  if (process.env.SIGEH_L3B0_QA_READONLY === "1") {
    const qa = createRequire(import.meta.url)(
      root + "/scripts/qa/d22-preflight.cjs",
    );
    result.container = qa.container();
    owner = qa.client(
      "sigeh_qa_bootstrap",
      qa.secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
    );
    await owner.connect();
    check(owner.scram.sasl && owner.scram.final, "bootstrap_scram");
    await owner.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    result.identity = (
      await owner.query(
        "SELECT current_database() AS database,current_user AS role,session_user AS session_role,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only,(SELECT system_identifier::text FROM pg_control_system()) AS cluster",
      )
    ).rows[0];
    check(
      result.identity.database === "sigeh_qa" &&
        result.identity.role === "sigeh_qa_bootstrap" &&
        result.identity.session_role === result.identity.role &&
        result.identity.version === "17.11" &&
        result.identity.read_only === "on" &&
        result.identity.cluster === "7707094012630982690",
      "qa_identity",
    );
    result.role = (
      await owner.query(
        "SELECT oid,rolname,rolsuper,rolinherit,rolcanlogin,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
      )
    ).rows[0];
    check(
      result.role?.rolcanlogin &&
        !result.role.rolsuper &&
        !result.role.rolinherit &&
        !result.role.rolcreatedb &&
        !result.role.rolcreaterole &&
        !result.role.rolreplication &&
        !result.role.rolbypassrls,
      "app_attributes",
    );
    result.memberships = (
      await owner.query(
        "SELECT roleid,member,admin_option,inherit_option,set_option FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole",
      )
    ).rows;
    check(result.memberships.length === 0, "app_memberships");
    check(
      (
        await owner.query(
          "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o'",
        )
      ).rowCount === 0,
      "app_ownership",
    );
    const direct = (
      await owner.query(`SELECT 'table' AS scope,c.relname,NULL::text AS column_name,a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.relnamespace='sigeh'::regnamespace AND a.grantee='sigeh_qa_app'::regrole
 UNION ALL SELECT 'column',c.relname,att.attname,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_attribute att ON att.attrelid=c.oid CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE c.relnamespace='sigeh'::regnamespace AND a.grantee='sigeh_qa_app'::regrole ORDER BY 1,2,3,4`)
    ).rows;
    result.baseline_direct_entries = direct.length;
    check(
      direct.length === 73 && direct.every((x) => !x.is_grantable),
      "baseline_direct_grants",
    );
    const cols = [];
    result.target_relations = (
      await owner.query(
        "SELECT oid,relname,pg_get_userbyid(relowner) AS owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' AND relname=ANY($1::text[]) ORDER BY relname",
        [Object.keys(manifest.tables)],
      )
    ).rows;
    check(
      result.target_relations.length === 5 &&
        result.target_relations.every((x) => x.owner === "sigeh_qa_bootstrap"),
      "target_relations",
    );
    for (const table of result.target_relations) {
      const attrs = (
        await owner.query(
          "SELECT a.attnum,a.attname,a.attacl::text,has_column_privilege('sigeh_qa_app',a.attrelid,a.attnum,'SELECT') AS effective_select FROM pg_attribute a WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",
          [table.oid],
        )
      ).rows;
      check(
        attrs.filter((a) => manifest.tables[table.relname].includes(a.attname))
          .length === manifest.tables[table.relname].length,
        "live_columns_missing",
      );
      const rights = (
        await owner.query(
          "SELECT has_any_column_privilege('sigeh_qa_app',$1::oid,'SELECT,INSERT,UPDATE,REFERENCES') AS any_column_privilege,has_table_privilege('sigeh_qa_app',$1::oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS any_table_privilege",
          [table.oid],
        )
      ).rows[0];
      check(
        !rights.any_column_privilege && !rights.any_table_privilege,
        "unexpected_existing_rights",
      );
      const acl = (
        await owner.query(
          `SELECT 'table' AS scope,a.grantee::text AS grantee,a.privilege_type FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=$1::oid AND a.grantee IN (0,'sigeh_qa_app'::regrole)
 UNION ALL SELECT 'column',a.grantee::text,a.privilege_type FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE att.attrelid=$1::oid AND a.grantee IN (0,'sigeh_qa_app'::regrole)`,
          [table.oid],
        )
      ).rows;
      check(acl.length === 0, "public_or_direct_target_acl");
      for (const col of manifest.tables[table.relname]) {
        const actual = attrs.find((a) => a.attname === col);
        check(!actual.effective_select, "existing_effective_select");
        cols.push({
          table: "sigeh." + table.relname,
          column: col,
          direct_before: [],
          public_before: [],
          inherited_before: [],
          effective_select_before: false,
          add: "SELECT",
          expected_direct_after: ["SELECT"],
          rollback: "REVOKE SELECT(" + col + ")",
        });
      }
    }
    result.diff = cols;
    result.policies = (
      await owner.query(
        "SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='sigeh' AND tablename=ANY($1::text[])",
        [Object.keys(manifest.tables)],
      )
    ).rows;
    check(
      result.target_relations.every(
        (r) => !r.relrowsecurity && !r.relforcerowsecurity,
      ) && result.policies.length === 0,
      "rls_drift_review_required",
    );
    result.active_app_connections = (
      await owner.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND usename='sigeh_qa_app'",
      )
    ).rows[0].n;
    check(result.active_app_connections === 0, "active_app_connections");
    qa.bindAdmin(owner);
    result.inventory = await qa.structure();
    check(
      result.inventory.tables === 58 &&
        result.inventory.indexes === 100 &&
        result.inventory.constraints === 303 &&
        result.inventory.unvalidated === 0 &&
        result.inventory.invalid_indexes === 0,
      "inventory_drift",
    );
    result.facultades = (
      await owner.query(
        "SELECT codigo FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
        [
          [
            "CATALOGOS_ADMINISTRAR",
            "CATALOGOS_CONSULTAR",
            ...manifest.facultades_propuestas_no_insertadas,
          ],
        ],
      )
    ).rows;
    await owner.query("ROLLBACK");
    const app = qa.client(
      "sigeh_qa_app",
      qa.secret("/home/robreport/.config/sigeh/qa-app/password"),
    );
    try {
      await app.connect();
      check(app.scram.sasl && app.scram.final, "app_scram");
      result.app_identity = (
        await app.query(
          "SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only",
        )
      ).rows[0];
      check(
        result.app_identity.database === "sigeh_qa" &&
          result.app_identity.role === "sigeh_qa_app",
        "app_identity",
      );
    } finally {
      await app.end();
    }
    result.qa_catalogs = "PASS";
    result.status = "APROBABLE_SQL_ONLY";
    result.expected_direct_entries_after = 73 + 27;
    const folder = root + "/artifacts/permissions";
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      folder + "/l3b0-acl-diff.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    let md =
      "# L3B-0 — diff ACL propuesto, NO aplicado\n\nQA: sigeh_qa / sigeh_qa_app. Baseline directo: 73 entradas existentes; delta: +27 SELECT por columna; total directo esperado: 100. PUBLIC y membresías no aportan derechos en estas cinco tablas.\n\n| Columna | Directo actual | Efectivo actual | Delta solicitado | Rollback específico |\n|---|---|---|---|---|\n";
    for (const r of cols)
      md +=
        "| " +
        r.table +
        "." +
        r.column +
        " | ninguno | SELECT=false | +SELECT | " +
        r.rollback +
        " |\n";
    md +=
      "\nSolo lectura de catálogos; no filas de empleados/contratos. Sin RLS: el delta concede acceso de columnas, no aislamiento por hospital. El rollback requiere snapshot inicial sin derechos, delta exacto y ausencia de grants legítimos posteriores.\n";
    fs.writeFileSync(folder + "/l3b0-acl-diff.md", md);
  }
} catch (e) {
  result.status = "BLOQUEADO";
  result.error =
    e.code || (/^[a-z_]+$/.test(e.message) ? e.message : "review_failed");
} finally {
  if (owner) await owner.end().catch(() => {});
  fs.writeFileSync(
    "/tmp/sigeh-l3b0-result.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  const brief = { ...result };
  delete brief.diff;
  delete brief.query_columns;
  console.log(JSON.stringify(brief));
  process.exitCode = result.status === "BLOQUEADO" ? 1 : 0;
}
