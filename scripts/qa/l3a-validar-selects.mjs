// Opt-in EXPLAIN only, never applies privileges or returns employee rows.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
if (process.env.SIGEH_L3A_PLAN_QA !== "1") {
  process.stderr.write("L3A_READONLY_PLAN_OPT_IN_REQUIRED\n");
  process.exit(1);
}
import fs from "node:fs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const qa = createRequire(import.meta.url)(
  root + "/scripts/qa/d22-preflight.cjs",
);
const queries = await import(
  root + "/apps/api/dist/modules/lecturas/read.sql.js"
);
const id = "11111111-1111-4111-8111-111111111111";
let c;
const result = {
  status: "BLOQUEADO",
  plans: [],
  analyze: false,
  sql_writes: 0,
};
try {
  qa.container();
  c = qa.client(
    "sigeh_qa_bootstrap",
    qa.secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
  );
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const identity = (
    await c.query(
      "SELECT current_database() AS db,current_user AS role,current_setting('transaction_read_only') AS read_only,(SELECT system_identifier::text FROM pg_control_system()) AS cluster",
    )
  ).rows[0];
  if (
    identity.db !== "sigeh_qa" ||
    identity.role !== "sigeh_qa_bootstrap" ||
    identity.read_only !== "on" ||
    identity.cluster !== "7707094012630982690"
  )
    throw Error("identity");
  result.identity = identity;
  const params = {
    STAFF_LIST_SQL: [
      id,
      "PERSONAL_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16",
      null,
      51,
    ],
    STAFF_DETAIL_SQL: [
      id,
      "PERSONAL_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16",
      id,
    ],
    EMPLOYEE_ASSIGNMENTS_SQL: [
      id,
      "PERSONAL_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16",
      id,
      null,
      51,
    ],
    CONTRACT_ASSIGNMENTS_SQL: [
      id,
      "PERSONAL_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16",
      id,
      null,
      51,
    ],
    PROGRAM_LIST_SQL: [
      id,
      "PROGRAMACION_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16T00:00:00Z",
      "2026-11-23T00:00:00Z",
      null,
      51,
    ],
    DASHBOARD_SQL: [
      id,
      "TABLERO_CONSULTAR",
      id,
      id,
      null,
      "2026-11-16T00:00:00Z",
      "2026-11-23T00:00:00Z",
    ],
  };
  for (const [name, sql] of Object.entries(queries)) {
    if (!sql.startsWith("WITH authorized_scopes")) throw Error("unsafe_query");
    await c.query("EXPLAIN (FORMAT JSON) " + sql, params[name]);
    result.plans.push({ name, status: "PASS" });
  }
  await c.query("ROLLBACK");
  result.status = "PASS";
} catch (e) {
  result.error = e.code || "READONLY_PLAN_FAILED";
} finally {
  if (c) await c.end();
  fs.writeFileSync(
    "/tmp/sigeh-l3a-explain-result.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
}
