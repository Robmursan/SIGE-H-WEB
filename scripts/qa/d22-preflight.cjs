// D2.2 controlled QA preflight; SQL catalog queries only. No fixture writes.
"use strict";
const fs = require("node:fs"),
  cp = require("node:child_process"),
  crypto = require("node:crypto");
const { createRequire } = require("node:module");
const ROOT = require("node:path").resolve(__dirname, "../..");
const pg = createRequire(ROOT + "/apps/api/package.json")("pg");
const C = "sigeh-qa-b1-postgres-qa-1",
  CID = "6192d6535032c20d5a09447f7a739160a25de1144a244fb8492f371f08b4fbee";
const DIR = "/home/robreport/.config/sigeh/backups",
  BACK = DIR + "/D2.1-2026-11-12T04-47-23-556Z";
const paths = {
  grants: ROOT + "/infra/sql/migrations/V2__iam_local.permisos-qa.sql",
  verify: ROOT + "/infra/sql/migrations/V2__iam_local.verificacion.sql",
  rollback: ROOT + "/infra/sql/migrations/V2__iam_local.rollback.sql",
};
const hashes = {
  grants: "fde86595f523c768eda66f452c419fa66de907c1171de93bfce44b0414b5cb2e",
  verify: "2536ca33dd93679f0f9073b82eb943e1bf5e894f26f699f2c6dc8de42fc624f8",
  rollback: "c22917ae1677ab885b4c308a63f772de5135a076ba844b2a06829e55964c2906",
};
const V2 = [
  "usuario_credenciales",
  "sesiones_usuario",
  "refresh_tokens_sesion",
  "iam_limites_acceso",
  "auditoria_seguridad",
  "usuario_roles_contexto",
  "encargo_permisos",
];
const HBA = "7580c87d60bb8dcd34ff202ae2c11c2814f4488ed16b95406f985f36ee471991";
const out = {
  status: "BLOQUEADO",
  phase: "preflight",
  grants_attempted: false,
  grants_committed: false,
  recovery: "not_required",
};
let admin,
  password,
  historical,
  sql = {},
  expected = [],
  allColumns = [];
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
function assert(b, c) {
  if (!b) throw new Error(c);
}
function same(a, b, c) {
  assert(JSON.stringify(a) === JSON.stringify(b), c);
}
function mode(path, want) {
  const s = fs.lstatSync(path);
  assert(
    s.uid === process.getuid() &&
      (s.mode & 0o7777) === want &&
      !s.isSymbolicLink(),
    "private_file_permissions",
  );
  return s;
}
function secret(path) {
  mode(require("node:path").dirname(path), 0o700);
  assert(fs.realpathSync(path) === path, "secret_symlink");
  const fd = fs.openSync(
    path,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const s = fs.fstatSync(fd);
    assert(
      s.isFile() &&
        s.uid === process.getuid() &&
        (s.mode & 0o7777) === 0o600 &&
        s.size > 0 &&
        s.size < 4096,
      "secret_file_permissions",
    );
    const p = fs.readFileSync(fd, "utf8").replace(/\r?\n$/, "");
    assert(p.length > 0 && !/[\r\n\0]/.test(p), "secret_format");
    return p;
  } finally {
    fs.closeSync(fd);
  }
}
function docker(args, input, encoding = "utf8", timeout = 20000) {
  const r = cp.spawnSync("docker", args, {
    input,
    encoding,
    timeout,
    maxBuffer: 256 * 1024 * 1024,
  });
  assert(r.status === 0, "docker_command_failed");
  return r.stdout;
}
function container() {
  const d = JSON.parse(
    docker([
      "inspect",
      "--format",
      '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"health":{{json .State.Health.Status}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}}',
      C,
    ]),
  );
  assert(d.id === CID && d.name === "/" + C, "container_identity");
  assert(d.running && d.health === "healthy", "qa_not_running_healthy");
  assert(
    d.ports["5432/tcp"].some(
      (p) => p.HostIp === "127.0.0.1" && p.HostPort === "55432",
    ) &&
      d.mounts.some(
        (m) =>
          m.Name === "sigeh-qa-b1_qa_data" &&
          m.Destination === "/var/lib/postgresql/data" &&
          m.RW,
      ),
    "qa_route",
  );
  return { id: d.id, name: d.name, health: d.health };
}
function client(user, pw) {
  const c = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    database: "sigeh_qa",
    user,
    password: pw,
    ssl: false,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    application_name: "sigeh-d21g-grants-audit",
    options:
      "-c lock_timeout=5000 -c statement_timeout=15000 -c idle_in_transaction_session_timeout=30000",
  });
  c.on("error", () => {});
  c.scram = { sasl: false, final: false };
  c.connection.on("authenticationSASL", () => {
    c.scram.sasl = true;
  });
  c.connection.on("authenticationSASLFinal", () => {
    c.scram.final = true;
  });
  return c;
}
async function q(t, p) {
  return (await admin.query(t, p)).rows;
}
async function identity() {
  const i = (
    await q(
      "SELECT current_database() AS database,current_user AS role,session_user AS login,current_setting('server_version') AS version,(SELECT system_identifier::text FROM pg_control_system()) AS cluster",
    )
  )[0];
  assert(
    i.database === "sigeh_qa" &&
      i.role === "sigeh_qa_bootstrap" &&
      i.login === i.role &&
      i.version === "17.11" &&
      i.cluster === "7707094012630982690",
    "database_identity",
  );
  return i;
}
async function noPeers() {
  assert(
    (
      await q(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()",
      )
    ).length === 0,
    "active_clients",
  );
}
async function structure() {
  return (
    await q(
      "SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r') AS tables,(SELECT count(*)::int FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='i') AS indexes,(SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace) AS constraints,(SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace AND NOT convalidated) AS unvalidated,(SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal) AS user_triggers,(SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='sigeh'::regnamespace AND (NOT i.indisvalid OR NOT i.indisready)) AS invalid_indexes",
    )
  )[0];
}
async function v1(oids) {
  return {
    tables: await q(
      "SELECT oid,relname,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",
      [oids],
    ),
    columns: await q(
      "SELECT a.attrelid,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ANY($1::oid[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum",
      [oids],
    ),
    constraints: await q(
      "SELECT oid,conname,conrelid,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=ANY($1::oid[]) ORDER BY oid",
      [oids],
    ),
    indexes: await q(
      "SELECT i.indexrelid,i.indrelid,ic.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=ANY($1::oid[]) ORDER BY i.indexrelid",
      [oids],
    ),
    triggers: await q(
      "SELECT oid,tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid=ANY($1::oid[]) AND NOT tgisinternal ORDER BY oid",
      [oids],
    ),
    views_sequences: await q(
      "SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl::text,CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid) END AS view_definition FROM pg_class c WHERE c.relnamespace='sigeh'::regnamespace AND c.relkind IN ('v','S') ORDER BY c.oid",
    ),
  };
}
async function shared() {
  return {
    roles: await q(
      "SELECT oid,rolname,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname",
    ),
    memberships: await q(
      "SELECT roleid,member,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member",
    ),
    databases: await q(
      "SELECT oid,datname,datallowconn,datdba,datacl::text FROM pg_database ORDER BY datname",
    ),
    schemas: await q(
      "SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname IN ('public','sigeh') ORDER BY nspname",
    ),
    settings: await q(
      "SELECT setdatabase,setrole,setconfig FROM pg_db_role_setting ORDER BY setdatabase,setrole",
    ),
    defaults: await q(
      "SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl",
    ),
    extensions: await q(
      "SELECT extname,extversion,extowner,extnamespace FROM pg_extension ORDER BY extname",
    ),
    routines: await q(
      "SELECT p.oid,p.proname,p.pronamespace,p.proowner,p.prosecdef,p.proconfig,p.proacl::text,md5(pg_get_functiondef(p.oid)) AS definition_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('sigeh','public') OR p.prosecdef ORDER BY p.oid",
    ),
  };
}
async function direct() {
  return await q(`SELECT 'table' AS scope,n.nspname,c.relname AS object,NULL::text AS column,a.privilege_type AS privilege,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND a.grantee='sigeh_qa_app'::regrole
 UNION ALL SELECT 'column',n.nspname,c.relname,att.attname,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute att ON att.attrelid=c.oid CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND a.grantee='sigeh_qa_app'::regrole ORDER BY 1,2,3,4,5`);
}
async function otherAcl() {
  return await q(`SELECT 'table' AS scope,c.oid,0 AS attnum,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname IN ('sigeh','public') AND c.relkind IN ('r','v','m','f','p','S') AND a.grantee<>'sigeh_qa_app'::regrole
 UNION ALL SELECT 'column',c.oid,att.attnum,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute att ON att.attrelid=c.oid CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE n.nspname IN ('sigeh','public') AND a.grantee<>'sigeh_qa_app'::regrole ORDER BY 1,2,3,4,5,6`);
}
async function rowCounts(tables) {
  const list = [];
  for (const t of tables)
    list.push({
      table: t.relname,
      count: (
        await q(
          "SELECT count(*)::text AS n FROM sigeh." +
            pg.escapeIdentifier(t.relname),
        )
      )[0].n,
    });
  return list;
}
async function fullStructure() {
  const oids = (
    await q(
      "SELECT oid FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' ORDER BY oid",
    )
  ).map((r) => r.oid);
  const s = await v1(oids);
  for (const t of s.tables) delete t.relacl;
  return s;
}
function splitTop(t) {
  let depth = 0,
    start = 0;
  const list = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    if (t[i] === ")") depth--;
    if (t[i] === "," && depth === 0) {
      list.push(t.slice(start, i).trim());
      start = i + 1;
    }
  }
  list.push(t.slice(start).trim());
  return list;
}
function expectedGrants() {
  const keys = [];
  for (const m of sql.grants
    .replace(/--[^\n]*/g, "")
    .matchAll(/GRANT\s+([\s\S]+?)\s+ON\s+([\s\S]+?)\s+TO\s+sigeh_qa_app\s*;/g))
    for (const obj of splitTop(m[2]))
      for (const priv of splitTop(m[1])) {
        assert(/^sigeh\.[a-z_]+$/.test(obj), "grant_object");
        const p = /^(SELECT|INSERT|UPDATE)(?:\(([^)]+)\))?$/.exec(priv);
        assert(p, "grant_privilege");
        if (p[2])
          for (const col of p[2].split(","))
            keys.push(`column|sigeh|${obj.slice(6)}|${col.trim()}|${p[1]}`);
        else keys.push(`table|sigeh|${obj.slice(6)}||${p[1]}`);
      }
  return [...new Set(keys)].sort();
}
const key = (r) =>
  `${r.scope}|${r.nspname}|${r.object}|${r.column || ""}|${r.privilege}`;
async function effective() {
  return {
    table: await q(
      `SELECT n.nspname,c.relname,p.priv FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) p(priv) WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND CASE WHEN c.relkind IN ('r','v','m','f','p') THEN has_table_privilege('sigeh_qa_app',c.oid,p.priv) ELSE false END ORDER BY 1,2,3`,
    ),
    column: await q(
      `SELECT n.nspname,c.relname,a.attname,p.priv FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(priv) WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND a.attnum>0 AND NOT a.attisdropped AND CASE WHEN c.relkind IN ('r','v','m','f','p') THEN has_column_privilege('sigeh_qa_app',c.oid,a.attnum,p.priv) ELSE false END ORDER BY 1,2,3,4`,
    ),
    sequences: await q(
      `SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('sigeh_qa_app',c.oid,'SELECT,USAGE,UPDATE') ELSE false END ORDER BY 1,2`,
    ),
  };
}
function normalize(e) {
  return {
    table: e.table.map((r) => `${r.nspname}|${r.relname}|${r.priv}`).sort(),
    column: e.column
      .map((r) => `${r.nspname}|${r.relname}|${r.attname}|${r.priv}`)
      .sort(),
    sequences: e.sequences,
  };
}
function expectedEffective() {
  const table = [],
    column = new Set();
  for (const k of expected) {
    const [scope, nsp, obj, col, priv] = k.split("|");
    if (scope === "table") {
      table.push(`${nsp}|${obj}|${priv}`);
      for (const c of allColumns.filter(
        (c) => c.nspname === nsp && c.relname === obj,
      ))
        column.add(`${nsp}|${obj}|${c.attname}|${priv}`);
    } else column.add(`${nsp}|${obj}|${col}|${priv}`);
  }
  return { table: table.sort(), column: [...column].sort(), sequences: [] };
}
async function roleSecurity() {
  const r = (
    await q(
      "SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
    )
  )[0];
  assert(
    r &&
      r.rolcanlogin &&
      !r.rolsuper &&
      !r.rolinherit &&
      !r.rolcreatedb &&
      !r.rolcreaterole &&
      !r.rolreplication &&
      !r.rolbypassrls,
    "app_attributes",
  );
  assert(
    (
      await q(
        "SELECT 1 FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole",
      )
    ).length === 0,
    "memberships",
  );
  assert(
    (
      await q(
        "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o'",
      )
    ).length === 0,
    "ownership",
  );
  assert(
    (
      await q(
        "SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname !~ '^pg_toast' AND nspname !~ '^pg_temp' AND has_schema_privilege('sigeh_qa_app',oid,'CREATE')",
      )
    ).length === 0,
    "schema_create",
  );
  return r;
}
function backendState() {
  const list = [];
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    if (+pid === process.pid) continue;
    try {
      const cmd = fs
        .readFileSync("/proc/" + pid + "/cmdline", "utf8")
        .split("\0");
      if (!/\/(?:node|nodejs)$/.test(cmd[0] || "")) continue;
      let cwd;
      try {
        cwd = fs.readlinkSync("/proc/" + pid + "/cwd");
      } catch {
        continue;
      }
      if (
        !(cwd === ROOT || cwd.startsWith(ROOT + "/")) &&
        !cmd.some((x) => x.startsWith(ROOT + "/"))
      )
        continue;
      if (!cmd.some((x) => /dist\/main|nest|start-qa/.test(x))) continue;
      const env = fs
        .readFileSync("/proc/" + pid + "/environ", "utf8")
        .split("\0");
      const flag = env.find((x) => x.startsWith("IAM_V2_ENABLED="));
      assert(!flag || flag === "IAM_V2_ENABLED=false", "iam_backend_enabled");
      list.push({ pid: +pid, iam_enabled: false });
    } catch (e) {
      if (e.message === "iam_backend_enabled") throw e;
      if (!["ENOENT", "ESRCH"].includes(e.code))
        throw new Error("backend_state_unreadable");
    }
  }
  assert(
    fs
      .readFileSync(
        ROOT + "/apps/api/src/modules/iam/domain/iam-settings.ts",
        "utf8",
      )
      .includes("'IAM_V2_ENABLED', 'false'"),
    "iam_default",
  );
  return { running_backend_processes: list, default_enabled: false };
}
async function invariant() {
  same(
    await structure(),
    {
      tables: 58,
      indexes: 100,
      constraints: 303,
      unvalidated: 0,
      user_triggers: 8,
      invalid_indexes: 0,
    },
    "inventory",
  );
  same(await shared(), historical.shared, "shared_drift");
  same(await v1(historical.oids), historical.v1, "v1_drift");
  same(await rowCounts(historical.v1.tables), historical.rows, "v1_row_counts");
  const objects = await q(
    "SELECT oid,relname,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' AND relname=ANY($1::text[]) ORDER BY relname",
    [V2],
  );
  assert(
    objects.length === 7 &&
      objects.every((r) => r.owner === "sigeh_qa_bootstrap"),
    "v2_objects",
  );
  assert(
    (await rowCounts(objects)).every((r) => r.count === "0"),
    "v2_not_empty",
  );
  const hba = await q(
    "SELECT rule_number,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number",
  );
  assert(
    hba.length === 7 &&
      hba.every((r) => r.auth_method === "scram-sha-256" && !r.error),
    "hba",
  );
  assert(
    docker([
      "exec",
      "--user",
      "postgres",
      C,
      "sha256sum",
      "/var/lib/postgresql/data/pg_hba.conf",
    ]).split(/\s+/)[0] === HBA,
    "hba_hash",
  );
  out.role = await roleSecurity();
  out.backend = backendState();
}
async function verifier(after) {
  const clean = sql.verify.replace(/--[^\n]*/g, "");
  assert(
    clean
      .split(";")
      .filter((s) => s.trim())
      .every((s) => /^\s*SELECT\b/.test(s)),
    "verify_select_only",
  );
  const sets = (await admin.query(sql.verify)).map((r) => r.rows);
  assert(
    sets.length === 11 && sets[0][0].destino_correcto,
    "verifier_identity",
  );
  const seq = sets.find((r) => r[0] && "can_use" in r[0]);
  assert(
    seq.length === 4 && seq.every((r) => !r.can_use),
    "sequence_privileges",
  );
  const counts = sets.find((r) => r[0] && "filas" in r[0]);
  assert(
    counts.length === 7 && counts.every((r) => r.filas === "0"),
    "verifier_v2_rows",
  );
  const checks = sets.find((r) => r[0] && "session_insert" in r[0])[0];
  same(
    Object.values(checks),
    after
      ? [true, true, true, false, false, false, false]
      : [false, false, false, false, false, false, false],
    "protected_privileges",
  );
  const objects = +sets.find(
    (r) => r[0] && "objetos_con_permisos_datos" in r[0],
  )[0].objetos_con_permisos_datos;
  assert(
    objects ===
      (after ? new Set(expected.map((k) => k.split("|")[2])).size : 0),
    "objects_with_access",
  );
  return {
    statements: 11,
    sequence_checks: 4,
    v2_counts: counts,
    protected_checks: checks,
    objects_with_data_access: objects,
  };
}
async function backupCheck() {
  mode(BACK, 0o700);
  const path = BACK + "/sigeh_qa.before-V2.dump";
  mode(path, 0o600);
  const data = fs.readFileSync(path);
  assert(
    sha(data) ===
      "729748da43b1779ebe2a70b979505c7cfd811aa640bad27a924ef42352766eda" &&
      data.length === 159093,
    "backup_hash",
  );
  const toc = docker(
    ["exec", "-i", "--user", "postgres", C, "pg_restore", "--list"],
    data,
  );
  assert(
    (toc.match(/ TABLE sigeh /g) || []).length === 51 &&
      (toc.match(/ TABLE DATA sigeh /g) || []).length === 51,
    "backup_toc",
  );
  const schema = docker(
    [
      "exec",
      "-i",
      "--user",
      "postgres",
      C,
      "pg_restore",
      "--schema-only",
      "--create",
      "--file=-",
    ],
    data,
  );
  assert(
    schema.includes("CREATE DATABASE sigeh_qa ") &&
      schema.includes("GRANT CONNECT ON DATABASE sigeh_qa TO sigeh_qa_app") &&
      schema.includes("GRANT USAGE ON SCHEMA sigeh TO sigeh_qa_app"),
    "backup_acl",
  );
  for (const t of historical.v1.tables)
    assert(schema.includes(t.relname), "backup_table");
  docker(
    [
      "exec",
      "-i",
      "--user",
      "postgres",
      C,
      "pg_restore",
      "--data-only",
      "--file=/dev/null",
    ],
    data,
  );
  return {
    path,
    sha256: sha(data),
    bytes: data.length,
    permissions: "0700/0600",
    tables: 51,
    table_data: 51,
    schema_data_decoded: true,
    restored: false,
  };
}
async function appAuth() {
  const c = client(
    "sigeh_qa_app",
    secret("/home/robreport/.config/sigeh/qa-app/password"),
  );
  try {
    await c.connect();
    assert(c.scram.sasl && c.scram.final, "app_scram");
    const i = (
      await c.query(
        "SELECT current_user AS role,current_database() AS database,current_setting('search_path') AS search_path,current_setting('transaction_read_only') AS read_only,inet_client_addr()::text AS client,inet_server_addr()::text AS server,s.ssl FROM pg_stat_ssl s WHERE pid=pg_backend_pid()",
      )
    ).rows[0];
    assert(
      i.role === "sigeh_qa_app" &&
        i.database === "sigeh_qa" &&
        i.read_only === "on" &&
        i.search_path.replace(/\s/g, "") === "pg_catalog,sigeh,pg_temp",
      "app_identity",
    );
    return { scram: "PASS", ...i };
  } finally {
    await c.end().catch(() => {});
  }
}

async function inspectQA() {
  const report = { status: "BLOQUEADO", stage: "read_only_preflight" };
  try {
    report.container = container();
    for (const [k, p] of Object.entries(paths)) {
      sql[k] = fs.readFileSync(p, "utf8");
      assert(sha(sql[k]) === hashes[k], "script_hash_drift");
    }
    expected = expectedGrants();
    password = secret("/home/robreport/.config/sigeh/qa-bootstrap-password");
    admin = client("sigeh_qa_bootstrap", password);
    await admin.connect();
    assert(admin.scram.sasl && admin.scram.final, "admin_scram");
    report.identity = await identity();
    historical = JSON.parse(
      fs.readFileSync(BACK + "/preflight.json", "utf8"),
    ).before;
    await noPeers();
    await q("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await invariant();
    allColumns = await q(
      "SELECT n.nspname,c.relname,a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='sigeh' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3",
    );
    const acl = await direct();
    same(acl.map(key).sort(), expected, "direct_grants");
    assert(
      acl.every((r) => !r.is_grantable),
      "grant_option",
    );
    same(normalize(await effective()), expectedEffective(), "effective_grants");
    report.grants = { exact_direct: acl.length, unexpected: 0 };
    report.verifier = await verifier(true);
    report.inventory = await structure();
    const previous = JSON.parse(
      fs.readFileSync(
        DIR + "/D2.1-G-2026-11-15T21-10-49-657Z/after.json",
        "utf8",
      ),
    );
    same(await fullStructure(), previous.structure, "ddl_drift_since_grants");
    const all = await q(
      "SELECT oid,relname FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' ORDER BY oid",
    );
    report.before_rows = await rowCounts(all);
    report.role = await roleSecurity();
    report.backend = out.backend;
    report.row_security = await q(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' AND (relrowsecurity OR relforcerowsecurity)",
    );
    await q("ROLLBACK");
    report.app_auth = await appAuth();
    await noPeers();
    report.backup = await backupCheck();
    report.status = "PASS";
    report.sql_writes = 0;
    report.stage = "complete";
  } catch (e) {
    report.failure_code =
      e.code || (/^[a-z_]+$/.test(e.message) ? e.message : "sanitized_error");
  } finally {
    if (admin) await admin.end().catch(() => {});
    password = undefined;
    fs.writeFileSync(
      "/tmp/sigeh-d22-preflight-result.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
  }
  return report;
}
module.exports = {
  inspectQA,
  client,
  secret,
  container,
  sha,
  bindAdmin(c) {
    admin = c;
  },
  q,
  structure,
  fullStructure,
  shared,
  direct,
  otherAcl,
  rowCounts,
};
if (require.main === module)
  inspectQA().then((r) => console.log(JSON.stringify(r)));
