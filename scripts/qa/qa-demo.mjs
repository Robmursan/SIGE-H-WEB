// Prepared opt-in interactive QA lifecycle. Never starts Docker or runs on import.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import qa from "./d22-preflight.cjs";
import { createFixtures } from "./qa-demo-fixtures.mjs";
import { TABLE_KEYS, deleteOwned, cleanupPlan } from "./qa-demo-cleanup.mjs";
import {
  TARGET,
  CODES,
  BASE,
  check,
  same,
  options,
  authorize,
  directory,
  readPrivate,
  writePrivate,
  loadRun,
  acquire,
  contextFromProfile,
  demoEnvironment,
  sanitize,
} from "./qa-demo-core.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(ROOT + "/apps/api/package.json");

let admin, m, dir, release;
const q = async (s, p) => (await admin.query(s, p)).rows;
const sha = (b) => createHash("sha256").update(b).digest("hex");
function persist() {
  writePrivate(path.join(dir, "manifest.json"), m);
}
async function connect() {
  qa.container(); // pinned CID, volume, loopback route, healthy; rejects before secrets/network.
  admin = qa.client(
    "sigeh_qa_bootstrap",
    qa.secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
  );
  await admin.connect();
  qa.bindAdmin(admin);
  check(admin.scram.sasl && admin.scram.final, "BOOTSTRAP_SCRAM");
  const i = (
    await q(
      "SELECT current_database() AS database,current_user AS role,session_user AS login,current_setting('server_version') AS version,(SELECT system_identifier::text FROM pg_control_system()) AS cluster",
    )
  )[0];
  check(
    i.database === TARGET.database &&
      i.role === "sigeh_qa_bootstrap" &&
      i.login === i.role &&
      i.cluster === TARGET.cluster &&
      i.version === "17.11",
    "QA_IDENTITY_REJECTED",
  );
  return i;
}
async function closeAdmin() {
  if (admin) {
    await admin.end().catch(() => {});
    admin = undefined;
  }
}
async function counts() {
  const rows = await q(
    "SELECT relname FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' ORDER BY relname",
  );
  return qa.rowCounts(rows);
}
async function header() {
  return {
    structure: await qa.fullStructure(),
    shared: await qa.shared(),
    direct: await qa.direct(),
    other: await qa.otherAcl(),
  };
}
async function validateHeader() {
  const logging = Object.fromEntries(
    (
      await q(
        "SELECT name,setting FROM pg_settings WHERE name IN ('log_statement','log_min_duration_statement','log_min_duration_sample','log_transaction_sample_rate','log_parameter_max_length_on_error')",
      )
    ).map((row) => [row.name, row.setting]),
  );
  check(
    logging.log_statement === "none" &&
      logging.log_min_duration_statement === "-1" &&
      logging.log_min_duration_sample === "-1" &&
      logging.log_transaction_sample_rate === "0" &&
      logging.log_parameter_max_length_on_error === "0",
    "LOGGING_REVIEW_REQUIRED",
  );
  const proof = JSON.parse(
    fs.readFileSync(ROOT + "/artifacts/permissions/l3b1-resultado.json"),
  );
  const file = path.join(proof.snapshot_directory, "after.json");
  check(
    sha(fs.readFileSync(file)) === proof.after_sha256,
    "ACL_SNAPSHOT_CHECKSUM",
  );
  const expected = readPrivate(file);
  const sharedBaseline = readPrivate(
    "/home/robreport/.config/sigeh/backups/D2.1-G-2026-11-15T21-10-49-657Z/after.json",
  ).shared;
  same(await qa.shared(), sharedBaseline, "SHARED_SECURITY_DRIFT");
  same(await qa.structure(), expected.inventory, "INVENTORY_DRIFT");
  same(await qa.direct(), expected.direct, "DIRECT_ACL_DRIFT");
  same(await qa.otherAcl(), expected.other_acl, "OTHER_ACL_DRIFT");
  same(await qa.fullStructure(), expected.structure, "STRUCTURE_DRIFT");
  const role = (
    await q(
      "SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
    )
  )[0];
  same(role, expected.acl.role[0], "APP_ROLE_DRIFT");
  check(
    (
      await q(
        "SELECT 1 FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole",
      )
    ).length === 0,
    "APP_MEMBERSHIPS",
  );
  check(
    (
      await q(
        "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o'",
      )
    ).length === 0,
    "APP_OWNERSHIP",
  );
  const hba = await q("SELECT auth_method,error FROM pg_hba_file_rules");
  check(
    hba.length === 7 &&
      hba.every((x) => x.auth_method === "scram-sha-256" && !x.error),
    "HBA_DRIFT",
  );
  const catalog = await q(
    "SELECT permiso_id,codigo,descripcion FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
    [CODES],
  );
  const approved = JSON.parse(
    fs.readFileSync(ROOT + "/artifacts/permissions/l3b2a-resultado.json"),
  ).catalog_registered;
  same(
    catalog.map((x) => ({ id: x.permiso_id, code: x.codigo })),
    approved.slice().sort((a, b) => a.code.localeCompare(b.code)),
    "FACULTIES_DRIFT",
  );
  return catalog;
}
async function noPeers() {
  check(
    (
      await q(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()",
      )
    ).length === 0,
    "OTHER_QA_CLIENTS",
  );
}
async function transaction(work) {
  await admin.query("BEGIN");
  try {
    const xid = (await q("SELECT pg_current_xact_id()::text AS id"))[0].id;
    m.xids = [...new Set([...m.xids, String(BigInt(xid) & 0xffffffffn)])];
    persist();
    const value = await work();
    check(
      (await admin.query("COMMIT")).command === "COMMIT",
      "COMMIT_UNCONFIRMED",
    );
    return value;
  } catch (e) {
    await admin.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
async function hasher() {
  const { IamSettings } = await import(
    ROOT + "/apps/api/dist/modules/iam/domain/iam-settings.js"
  );
  const { PasswordHasher } = await import(
    ROOT + "/apps/api/dist/modules/iam/domain/password-hasher.js"
  );
  const values = {
    ...demoEnvironment(m, "/home/robreport/.config/sigeh/qa-app/password"),
    JWT_SECRET: randomBytes(48).toString("base64url"),
  };
  return new PasswordHasher(
    new IamSettings({ get: (name, fallback) => values[name] ?? fallback }),
  );
}
async function prepare(minutes) {
  await connect();
  await noPeers();
  const catalog = await validateHeader();
  const rows = await counts();
  const expected = JSON.parse(
    fs.readFileSync(ROOT + "/artifacts/permissions/l3b2a-resultado.json"),
  ).final_rows;
  same(
    rows.map((x) => ({ table: x.table, n: x.count })),
    expected,
    "BASELINE_ROWS_CHANGED",
  );
  check(
    (
      await q(
        "SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal AND c.relname=ANY($1::text[])",
        [
          Object.keys(TABLE_KEYS).concat([
            "sesiones_usuario",
            "refresh_tokens_sesion",
            "auditoria_seguridad",
            "iam_limites_acceso",
          ]),
        ],
      )
    ).length === 0,
    "FIXTURE_TRIGGER_REVIEW_REQUIRED",
  );
  const old = JSON.parse(
    fs.readFileSync(ROOT + "/artifacts/permissions/l3b1-resultado.json"),
  ).backup;
  check(
    fs.existsSync(old.path) && sha(fs.readFileSync(old.path)) === old.sha256,
    "BACKUP_UNAVAILABLE",
  );
  directory(BASE);
  const active = path.join(BASE, "active.json");
  check(!fs.existsSync(active), "ANOTHER_DEMO_RESERVED");
  const id = randomUUID();
  // Exclusive reservation across commands/runs; never silently steal a previous reservation.
  dir = path.join(BASE, id);
  check(!fs.existsSync(dir), "RUN_ID_COLLISION");
  directory(dir);
  release = acquire(path.join(dir, "command.lock"), id);
  m = {
    version: 1,
    runId: id,
    target: TARGET,
    state: "RESERVING",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    xids: [],
    created: {},
    demoDate: "2026-11-22",
    window: { desde: "2026-11-16T00:00:00Z", hasta: "2026-11-23T00:00:00Z" },
    baseline: { header: await header(), counts: rows },
  };
  persist();
  const fd = fs.openSync(active, "wx", 0o600);
  fs.writeFileSync(fd, JSON.stringify({ runId: id }));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  m.state = "PREPARING";
  persist();
  try {
    await createFixtures({
      owner: admin,
      hasher: await hasher(),
      m,
      persist,
      transaction: (work) =>
        transaction(async () => {
          await noPeers();
          same(await counts(), rows, "PREPARE_DATA_DRIFT");
          return work();
        }),
      catalogRows: catalog,
      saveCredentials: (creds) =>
        writePrivate(path.join(dir, "credentials.json"), creds),
    });
    same(await header(), m.baseline.header, "PREPARE_HEADER_DRIFT");
    writePrivate(path.join(dir, "context-labels.json"), {
      runId: id,
      contexts: [
        {
          name: "Hospital sintético A / servicio A1",
          hospitalId: m.ids.ha,
          divisionId: m.ids.da,
          servicioId: m.ids.sa,
        },
        {
          name: "Hospital sintético B / servicio B",
          hospitalId: m.ids.hb,
          divisionId: m.ids.db,
          servicioId: m.ids.sb,
        },
      ],
    });
    return {
      status: "PREPARED",
      runId: id,
      expiresAt: m.expiresAt,
      credentialsFile: path.join(dir, "credentials.json"),
      manifestFile: path.join(dir, "manifest.json"),
    };
  } catch (e) {
    m.state = "PREPARE_UNCERTAIN";
    persist();
    throw e;
  }
}
async function checkRun() {
  await validateHeader();
  same(await header(), m.baseline.header, "RUN_HEADER_DRIFT");
  same(
    await q(
      "SELECT permiso_id,codigo,descripcion FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
      [CODES],
    ),
    m.catalog,
    "RUN_CATALOG_DRIFT",
  );
}
function reserveRun() {
  const active = readPrivate(path.join(BASE, "active.json"));
  check(active.runId === m.runId, "RUN_NOT_RESERVED");
}
// SQL role remains separate from the bootstrap orchestrator; only API transactions get journaled.
function journalPool(pool) {
  pool.options.application_name = "sigeh-qa-demo-" + m.runId;
  pool.on("connect", (c) => {
    const original = c.query.bind(c);
    c.query = function (text, ...args) {
      const result = original(text, ...args);
      if (
        typeof text === "string" &&
        /^BEGIN READ WRITE$/i.test(text) &&
        typeof args.at(-1) !== "function"
      )
        return result.then(async (answer) => {
          try {
            const xid = (
              await original("SELECT pg_current_xact_id()::text AS id")
            ).rows[0].id;
            m.xids = [
              ...new Set([...m.xids, String(BigInt(xid) & 0xffffffffn)]),
            ];
            persist();
            return answer;
          } catch {
            await original("ROLLBACK").catch(() => {});
            throw Error("API_JOURNAL_FAILED");
          }
        });
      return result;
    };
  });
}
async function invalidate() {
  await connect();
  await checkRun();
  await noPeers();
  await transaction(async () => {
    await admin.query(
      "UPDATE sigeh.usuario_roles SET vigente_hasta=LEAST(vigente_hasta,clock_timestamp()) WHERE usuario_rol_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
      [m.created.usuario_roles, m.xids],
    );
    await admin.query(
      "UPDATE sigeh.sesiones_usuario SET revocada_en=COALESCE(revocada_en,clock_timestamp()),motivo_revocacion=COALESCE(motivo_revocacion,'QA_DEMO_CLOSED') WHERE usuario_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
      [m.created.usuarios, m.xids],
    );
  });
}
async function serve() {
  reserveRun();
  check(m.state === "PREPARED", "RUN_NOT_PREPARED");
  const env = demoEnvironment(
    m,
    "/home/robreport/.config/sigeh/qa-app/password",
  );
  await connect();
  await checkRun();
  await noPeers();
  await closeAdmin();
  // No ambient DB/PG/preload/IAM override is inherited. This affects this CLI child only.
  for (const key of Object.keys(process.env))
    if (!["PATH", "LANG", "TZ"].includes(key)) delete process.env[key];
  Object.assign(process.env, env, {
    JWT_SECRET: randomBytes(48).toString("base64url"),
  });
  const { Logger } = require("@nestjs/common");
  Logger.overrideLogger(false);
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = await import(ROOT + "/apps/api/dist/app.module.js");
  const { configureApp } = await import(ROOT + "/apps/api/dist/main.js");
  const { PG_POOL } = await import(
    ROOT + "/apps/api/dist/database/postgres.service.js"
  );
  let app, timer, stopHandler;
  try {
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    const signalBefore = new Map(
      ["SIGINT", "SIGTERM"].map((name) => [
        name,
        new Set(process.listeners(name)),
      ]),
    );
    configureApp(app);
    for (const name of ["SIGINT", "SIGTERM"])
      for (const listener of process.listeners(name))
        if (!signalBefore.get(name).has(listener))
          process.removeListener(name, listener);
    let finish;
    const stopped = new Promise((resolve) => {
      finish = resolve;
    });
    stopHandler = () => finish();
    process.once("SIGINT", stopHandler);
    process.once("SIGTERM", stopHandler);
    const pool = app.get(PG_POOL);
    journalPool(pool);
    app.use((_req, res, next) => {
      res.setHeader("X-Sigeh-Qa-Demo-Run", m.runId);
      next();
    });
    await app.listen(3000, "127.0.0.1");
    check(
      app.getHttpServer().address().address === "127.0.0.1",
      "LOOPBACK_REQUIRED",
    );
    const row = (
      await pool.query(
        "SELECT current_user AS role,current_database() AS database",
      )
    ).rows[0];
    check(
      row.role === TARGET.role && row.database === TARGET.database,
      "API_IDENTITY_REJECTED",
    );
    m.state = "SERVING";
    m.serverPid = process.pid;
    m.serverPort = 3000;
    persist();
    console.log(
      JSON.stringify({
        status: "SERVING",
        runId: m.runId,
        address: "127.0.0.1:3000",
        expiresAt: m.expiresAt,
      }),
    );
    timer = setTimeout(
      stopHandler,
      Math.max(1, Date.parse(m.expiresAt) - Date.now()),
    );
    await stopped;
  } finally {
    clearTimeout(timer);
    if (stopHandler) {
      process.removeListener("SIGINT", stopHandler);
      process.removeListener("SIGTERM", stopHandler);
    }
    if (app) await app.close();
    delete process.env.JWT_SECRET;
    // Explicit deletion is a separate cleanup command; close revokes only this run.
    try {
      await invalidate();
      m.state = "CLOSED_PENDING_CLEANUP";
    } catch {
      m.state = "CLOSE_REQUIRES_RECOVERY";
    }
    delete m.serverPid;
    persist();
  }
  return { status: m.state, runId: m.runId };
}
function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const bytes = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 3000,
        path: "/api/v1" + url,
        method,
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(bytes
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bytes),
              }
            : {}),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => {
          text += c;
          if (text.length > 1024 * 1024) req.destroy();
        });
        res.on("end", () => {
          try {
            check(
              res.headers["x-sigeh-qa-demo-run"] === m.runId,
              "WRONG_HTTP_RUN",
            );
            resolve({
              status: res.statusCode,
              body: text ? JSON.parse(text) : null,
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.setTimeout(8000, () => req.destroy());
    req.on("error", () => reject(Error("HTTP_DEMO_FAILED")));
    req.end(bytes);
  });
}
async function smoke() {
  check(m.state === "SERVING", "RUN_NOT_SERVING");
  check(Date.parse(m.expiresAt) > Date.now(), "RUN_EXPIRED");
  await connect();
  await checkRun();
  await closeAdmin();
  // Probe run marker before sending a credential to the listener.
  check((await request("GET", "/health")).status === 200, "HEALTH_FAILED");
  const creds = readPrivate(path.join(dir, "credentials.json"));
  let passed = 0;
  async function login(name) {
    const r = await request("POST", "/auth/login", {
      identificador: creds[name].identifier,
      password: creds[name].password,
    });
    check(r.status === 200, "LOGIN_FAILED");
    return r.body.accessToken;
  }
  const ta = await login("main"),
    tb = await login("other"),
    tn = await login("none");
  const pa = await request("GET", "/auth/me", undefined, ta),
    pb = await request("GET", "/auth/me", undefined, tb);
  check(pa.status === 200 && pb.status === 200, "PROFILE_FAILED");
  const ca = contextFromProfile(pa.body, CODES[0]),
    cb = contextFromProfile(pb.body, CODES[0]);
  check(
    ca.length === 1 &&
      cb.length === 1 &&
      ca[0].hospitalId === m.ids.ha &&
      cb[0].hospitalId === m.ids.hb,
    "PROFILE_CONTEXT_FAILED",
  );
  passed++;
  const routes = (c) => {
    const scope = new URLSearchParams(c).toString(),
      date = scope + "&fecha=" + m.demoDate,
      win = scope + "&" + new URLSearchParams(m.window);
    return [
      "/empleados?" + date,
      "/empleados/" +
        (c.hospitalId === m.ids.ha ? m.ids.e1 : m.ids.eb) +
        "?" +
        date,
      "/contratos/" +
        (c.hospitalId === m.ids.ha ? m.ids.c1 : m.ids.cb) +
        "/adscripciones?" +
        date,
      "/programaciones?" + win,
      "/tableros/coordinacion?" + win,
    ];
  };
  for (const [token, ctx] of [
    [ta, ca[0]],
    [tb, cb[0]],
  ])
    for (const url of routes(ctx)) {
      const r = await request("GET", url, undefined, token);
      check(r.status === 200, "READ_FAILED");
      const text = JSON.stringify(r.body);
      check(
        !/"rud"|password_hash|refreshToken|accessToken/.test(text),
        "RESPONSE_SECRET",
      );
      for (const u of Object.values(creds))
        check(!text.includes(u.password), "RESPONSE_CREDENTIAL");
      passed++;
    }
  for (const [token, ctx] of [
    [ta, cb[0]],
    [tb, ca[0]],
    [tn, ca[0]],
  ])
    for (const url of routes(ctx)) {
      check(
        (await request("GET", url, undefined, token)).status === 403,
        "CROSS_SCOPE_DENIAL_FAILED",
      );
      passed++;
    }
  return {
    status: "PASS",
    runId: m.runId,
    checks: passed,
    contextSource: "/auth/me",
    catalogAdminGranted: false,
  };
}
async function discoverOwned() {
  const users = m.created.usuarios ?? [],
    tx = m.xids;
  const sessions = await q(
    "SELECT sesion_id,xmin::text AS xid FROM sigeh.sesiones_usuario WHERE usuario_id=ANY($1::uuid[])",
    [users],
  );
  check(
    sessions.every((x) => tx.includes(x.xid)),
    "FOREIGN_SESSION_WRITER",
  );
  const sessionIds = sessions.map((x) => x.sesion_id);
  const refresh = await q(
    "SELECT token_id,xmin::text AS xid FROM sigeh.refresh_tokens_sesion WHERE sesion_id=ANY($1::uuid[])",
    [sessionIds],
  );
  check(
    refresh.every((x) => tx.includes(x.xid)),
    "FOREIGN_TOKEN_WRITER",
  );
  const audit = await q(
    "SELECT evento_id,xmin::text AS xid FROM sigeh.auditoria_seguridad WHERE xmin::text=ANY($1::text[])",
    [tx],
  );
  // A foreign writer referring to this run must block, never be removed by inference.
  const foreignAudit = await q(
    "SELECT 1 FROM sigeh.auditoria_seguridad WHERE (actor_usuario_id=ANY($1::uuid[]) OR objetivo_usuario_id=ANY($1::uuid[]) OR hospital_id=ANY($2::uuid[])) AND NOT(xmin::text=ANY($3::text[]))",
    [users, m.created.hospitales ?? [], tx],
  );
  check(foreignAudit.length === 0, "FOREIGN_AUDIT_DEPENDENCY");
  const buckets = await q(
    "SELECT clave_hash FROM sigeh.iam_limites_acceso WHERE xmin::text=ANY($1::text[])",
    [tx],
  );
  return [
    ["auditoria_seguridad", "evento_id", audit.map((x) => x.evento_id)],
    ["refresh_tokens_sesion", "token_id", refresh.map((x) => x.token_id)],
    ["sesiones_usuario", "sesion_id", sessionIds],
    ["iam_limites_acceso", "clave_hash", buckets.map((x) => x.clave_hash)],
  ];
}
async function cleanup() {
  reserveRun();
  check(m.state !== "CLEANED", "ALREADY_CLEANED");
  await connect();
  await checkRun();
  await noPeers();
  const api = await discoverOwned();
  m.cleanupSelection = Object.fromEntries(api.map(([t, , ids]) => [t, ids]));
  persist();
  const rows = cleanupPlan(m, api);
  await transaction(async () => {
    for (const [table, key, ids] of rows)
      await deleteOwned(admin, table, key, ids, m.xids);
    same(await counts(), m.baseline.counts, "CLEANUP_ROWS_NOT_BASELINE");
    same(await header(), m.baseline.header, "CLEANUP_HEADER_DRIFT");
  });
  m.state = "CLEANED";
  m.cleanedAt = new Date().toISOString();
  persist();
  const credentials = path.join(dir, "credentials.json");
  if (fs.existsSync(credentials)) fs.unlinkSync(credentials);
  const active = readPrivate(path.join(BASE, "active.json"));
  check(active.runId === m.runId, "RESERVATION_CHANGED");
  fs.unlinkSync(path.join(BASE, "active.json"));
  return {
    status: "CLEANED",
    runId: m.runId,
    remainingOwnRows: 0,
    facultiesRetained: true,
    auditResidue: 0,
  };
}
async function main() {
  const o = options(process.argv.slice(2));
  authorize(o.command);
  if (o.command === "plan")
    return {
      status: "PREPARED_NOT_EXECUTED",
      target: TARGET,
      commands: [
        "prepare --minutes 60",
        "serve --run UUID",
        "verify --run UUID",
        "smoke --run UUID",
        "cleanup --run UUID",
      ],
      catalogAdmin: false,
    };
  if (o.command === "prepare") return prepare(o.minutes);
  ({ m, dir } = loadRun(o.run));
  if (o.command === "cleanup" && m.state === "CLEANED") {
    await connect();
    await checkRun();
    same(await counts(), m.baseline.counts, "CLEANUP_BASELINE_DRIFT");
    const credentialFile = path.join(dir, "credentials.json");
    if (fs.existsSync(credentialFile)) fs.unlinkSync(credentialFile);
    const active = path.join(BASE, "active.json");
    if (fs.existsSync(active)) {
      check(readPrivate(active).runId === m.runId, "FOREIGN_RESERVATION");
      fs.unlinkSync(active);
    }
    return { status: "CLEANED", runId: m.runId, alreadyCleaned: true };
  }
  reserveRun();
  if (!["verify", "smoke"].includes(o.command))
    release = acquire(path.join(dir, "command.lock"), m.runId);
  if (o.command === "serve") return serve();
  if (o.command === "cleanup") return cleanup();
  if (o.command === "smoke") return smoke();
  await connect();
  await admin.query("BEGIN READ ONLY");
  await checkRun();
  const result = {
    status: "PASS",
    runId: m.runId,
    state: m.state,
    inventory: await qa.structure(),
    directEntries: (await qa.direct()).length,
    expiresAt: m.expiresAt,
  };
  await admin.query("ROLLBACK");
  return result;
}
const directExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directExecution) {
  try {
    console.log(JSON.stringify(await main()));
  } catch (e) {
    console.error(
      JSON.stringify({ status: "BLOCKED", code: sanitize(e), runId: m?.runId }),
    );
    process.exitCode = 1;
  } finally {
    await closeAdmin();
    if (release)
      try {
        release();
      } catch {
        process.exitCode = 1;
      }
  }
}
