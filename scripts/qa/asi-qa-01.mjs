// Authorized CU-ASI-QA-01 only. No usual-QA helpers/default destinations are imported.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import cp from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  randomUUID,
  randomBytes,
  createHash,
  pbkdf2Sync,
  createHmac,
} from "node:crypto";
import { runtime } from "./asi-qa/runtime.mjs";
import { fixtures } from "./asi-qa/fixtures.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
checkCleanEnvironment();
function checkCleanEnvironment() {
  if (process.env.NODE_OPTIONS) throw Error("NODE_PRELOAD_REJECTED");
  for (const key of Object.keys(process.env))
    if (/^(PG|DB_|DATABASE_URL$|IAM_|JWT_|ASISTENCIA_|L3A_)/.test(key))
      delete process.env[key];
}
const require = createRequire(path.join(ROOT, "apps/api/package.json"));
const { Client, Pool } = require("pg");
const MASTER =
  "/home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql";
const MASTER_HASH =
  "3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088";
const IMAGE =
  "sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac";
const OLD_CLUSTER = "7707094012630982690";
const check = (ok, code) => {
  if (!ok) throw Error(code);
};
const hash = (data) => createHash("sha256").update(data).digest("hex");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function docker(args) {
  try {
    return cp
      .execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20000,
      })
      .trim();
  } catch {
    throw Error("DOCKER_" + args[0].toUpperCase() + "_FAILED");
  }
}
const inspect = (kind, id) => JSON.parse(docker([kind, "inspect", id]))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function free(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", () => reject(Error("PORT_NOT_FREE_" + port)));
    s.listen(port, "127.0.0.1", () => s.close(resolve));
  });
}
function save() {
  fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2) + "\n", {
    mode: 0o600,
  });
}
let manifestFile, m, owner, pool, app, appPort, appPassword, adminPassword;
const clients = new Set();
const evidence = {
  status: "BLOCKED",
  tests: [],
  http: [],
  cleanup: "not_started",
};
async function step(name, fn) {
  evidence.phase = name;
  await fn();
  evidence.tests.push({ name, status: "PASS" });
  save();
}
function checkContainer() {
  const c = inspect("container", m.containerId);
  check(
    c.Id === m.containerId &&
      c.Name === "/" + m.containerName &&
      c.Image === IMAGE,
    "CONTAINER_IDENTITY_MISMATCH",
  );
  check(
    c.Config.Labels?.["sigeh.asi.run"] === m.runId &&
      c.Config.Labels?.["sigeh.asi.owner"] === "CU-ASI-QA-01",
    "OWNERSHIP_MISMATCH",
  );
  check(
    JSON.stringify(c.HostConfig.PortBindings) ===
      JSON.stringify({
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55433" }],
      }),
    "PORT_IDENTITY_MISMATCH",
  );
  check(
    Object.keys(c.HostConfig.Tmpfs ?? {})
      .sort()
      .join(",") === "/run/asi-secrets,/var/lib/postgresql/data",
    "STORAGE_IDENTITY_MISMATCH",
  );
  check(
    (c.Mounts ?? []).every((x) => x.Type === "tmpfs"),
    "NON_EPHEMERAL_MOUNT",
  );
  check(
    c.HostConfig.NetworkMode === m.networkName &&
      Object.keys(c.NetworkSettings.Networks).length === 1 &&
      (c.NetworkSettings.Networks[m.networkName]?.NetworkID === m.networkId ||
        (c.State.Status === "created" &&
          c.NetworkSettings.Networks[m.networkName]?.NetworkID === "")),
    "NETWORK_ATTACHMENT_MISMATCH",
  );
  return c;
}
function checkNetwork() {
  const n = inspect("network", m.networkId);
  check(
    n.Id === m.networkId &&
      n.Name === m.networkName &&
      n.Internal &&
      n.Labels?.["sigeh.asi.run"] === m.runId &&
      n.Labels?.["sigeh.asi.owner"] === "CU-ASI-QA-01",
    "NETWORK_IDENTITY_MISMATCH",
  );
  return n;
}
async function identity() {
  const container = checkContainer();
  checkNetwork();
  check(
    m.targetHost ===
      container.NetworkSettings.Networks[m.networkName].IPAddress &&
      net.isIPv4(m.targetHost) &&
      m.targetHost !== "127.0.0.1",
    "TARGET_IP_MISMATCH",
  );
  const r = (
    await owner.query(
      "SELECT current_database() AS database,current_user AS role,(SELECT system_identifier::text FROM pg_control_system()) AS cluster,current_setting('server_version') AS version,inet_client_addr()::text AS client,inet_server_addr()::text AS server",
    )
  ).rows[0];
  check(
    r.database === "sigeh_qa" &&
      r.role === "sigeh_qa_bootstrap" &&
      r.cluster !== OLD_CLUSTER &&
      r.version.startsWith("17.11"),
    "SQL_IDENTITY_MISMATCH",
  );
  if (m.cluster) check(r.cluster === m.cluster, "CLUSTER_CHANGED");
  else m.cluster = r.cluster;
  save();
  return r;
}
async function cleanup() {
  evidence.cleanup = "in_progress";
  save();
  if (app) {
    await app.close();
    app = undefined;
  }
  if (pool) {
    await pool.end().catch(() => {});
    pool = undefined;
  }
  for (const c of clients) await c.end().catch(() => {});
  clients.clear();
  if (owner) {
    await owner.end().catch(() => {});
    owner = undefined;
  }
  if (m.containerId) {
    const c = checkContainer();
    checkNetwork();
    evidence.cleanup_identity = {
      containerId: c.Id,
      name: c.Name,
      image: c.Image,
      runId: m.runId,
      networkId: m.networkId,
      mounts: (c.Mounts ?? []).map((x) => ({
        type: x.Type,
        destination: x.Destination,
      })),
      tmpfs: Object.keys(c.HostConfig.Tmpfs),
    };
    save();
    if (c.State.Running) docker(["stop", "--timeout", "10", m.containerId]);
    const stopped = checkContainer();
    check(!stopped.State.Running, "CONTAINER_STILL_RUNNING");
    docker(["rm", m.containerId]);
    const remaining = docker([
      "ps",
      "-a",
      "--no-trunc",
      "--filter",
      "label=sigeh.asi.run=" + m.runId,
      "--format",
      "{{.ID}}",
    ]);
    check(remaining === "", "CONTAINER_REMOVAL_UNCONFIRMED");
  }
  if (m.networkId) {
    const n = checkNetwork();
    check(Object.keys(n.Containers ?? {}).length === 0, "NETWORK_NOT_EMPTY");
    docker(["network", "rm", m.networkId]);
    const remaining = docker([
      "network",
      "ls",
      "--filter",
      "label=sigeh.asi.run=" + m.runId,
      "--format",
      "{{.ID}}",
    ]);
    check(remaining === "", "NETWORK_REMOVAL_UNCONFIRMED");
  }
  await free(55433);
  await free(3001);
  evidence.cleanup = "verified_destroyed";
  m.phase = "DESTROYED";
  save();
}
function verifier(password) {
  const salt = randomBytes(16),
    salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest(),
    stored = createHash("sha256").update(clientKey).digest(),
    server = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored.toString("base64")}:${server.toString("base64")}`;
}
function client(
  password,
  user = "sigeh_qa_bootstrap",
  application = "sigeh-asi-owner",
) {
  const c = new Client({
    host: m.targetHost,
    port: 5432,
    database: "sigeh_qa",
    user,
    password,
    application_name: application,
    connectionTimeoutMillis: 2000,
    query_timeout: 10000,
  });
  c.proof = { sasl: false, final: false };
  c.connection.on("authenticationSASL", () => {
    c.proof.sasl = true;
  });
  c.connection.on("authenticationSASLFinal", () => {
    c.proof.final = true;
  });
  return c;
}
async function inventory() {
  return (
    await owner.query(`SELECT
 (SELECT count(*)::int FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r') AS tables,
 (SELECT count(*)::int FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='i') AS indexes,
 (SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace) AS constraints,
 (SELECT count(*)::int FROM pg_constraint WHERE connamespace='sigeh'::regnamespace AND NOT convalidated) AS unvalidated,
 (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='sigeh'::regnamespace AND (NOT i.indisvalid OR NOT i.indisready)) AS invalid_indexes,
 (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal) AS triggers`)
  ).rows[0];
}
async function protectedBaseline() {
  const tables = [
    "incidencias",
    "incidencia_versiones",
    "incidencia_autorizaciones",
    "asignaciones_operativas",
    "incorporaciones_servicio",
    "aplicaciones_cobertura",
    "cierres_balance",
  ];
  const counts = {};
  for (const t of tables)
    counts[t] = (
      await owner.query("SELECT count(*)::int AS n FROM sigeh." + t)
    ).rows[0].n;
  return counts;
}
async function produced(id) {
  return (
    await owner.query(
      `SELECT
 (SELECT count(*)::int FROM sigeh.registros_asistencia WHERE programacion_id=$1) AS records,
 (SELECT count(*)::int FROM sigeh.eventos_asistencia e JOIN sigeh.registros_asistencia a USING(asistencia_id) WHERE a.programacion_id=$1) AS events,
 (SELECT count(*)::int FROM sigeh.auditoria_general g JOIN sigeh.registros_asistencia a ON g.registro_id=a.asistencia_id WHERE a.programacion_id=$1 AND g.tabla='registros_asistencia') AS audits`,
      [id],
    )
  ).rows[0];
}
const equal = (a, b, code) =>
  check(JSON.stringify(a) === JSON.stringify(b), code);
function request(method, url, body, token, key) {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body),
      req = http.request(
        {
          agent: false,
          host: "127.0.0.1",
          port: appPort,
          path: "/api/v1" + url,
          method,
          headers: {
            ...(text
              ? {
                  "content-type": "application/json",
                  "content-length": Buffer.byteLength(text),
                }
              : {}),
            ...(token ? { authorization: "Bearer " + token } : {}),
            ...(key ? { "Idempotency-Key": key } : {}),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (x) => {
            data += x;
          });
          res.on("end", () => {
            try {
              const body = data ? JSON.parse(data) : null;
              evidence.http.push({
                method,
                path: url.split("?")[0],
                status: res.statusCode,
              });
              resolve({ status: res.statusCode, body });
            } catch {
              reject(Error("INVALID_HTTP_RESPONSE"));
            }
          });
        },
      );
    req.setTimeout(10000, () => req.destroy(Error("HTTP_TIMEOUT")));
    req.on("error", (e) =>
      reject(Object.assign(Error("HTTP_TRANSPORT_ERROR"), { code: e.code })),
    );
    req.end(text);
  });
}
const status = (r, s, code) => {
  check(r.status === s, code + "_HTTP_" + r.status);
  return r.body;
};
async function serve(enabled = true) {
  const identityData = {
    verified: true,
    port: 5432,
    host: m.targetHost,
    database: "sigeh_qa",
    cluster: m.cluster,
    containerId: m.containerId,
  };
  // A dedicated real app pool, never a bootstrap runtime credential.
  const ownPool = new Pool({
    host: m.targetHost,
    port: 5432,
    database: "sigeh_qa",
    user: "sigeh_qa_app",
    password: appPassword,
    max: 6,
    connectionTimeoutMillis: 2000,
    query_timeout: 8000,
    application_name: "sigeh-asi-" + m.runId,
    options:
      "-c search_path=pg_catalog,sigeh,pg_temp -c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000",
  });
  ownPool.on("error", () => {});
  ownPool.on("connect", (c) =>
    c.connection.on("errorMessage", (e) => {
      (evidence.pg_errors ??= []).push({
        code: e.code,
        table: e.table ?? null,
        constraint: e.constraint ?? null,
      });
    }),
  );
  const r = await runtime({
    root: ROOT,
    pool: ownPool,
    identity: identityData,
    enabled,
  });
  await r.app.listen(3001, "127.0.0.1");
  appPort = 3001;
  app = r.app;
  pool = ownPool;
  return r;
}
async function waiterCount(fragment, n) {
  const deadline = Date.now() + 1400;
  while (Date.now() < deadline) {
    const rows = (
      await owner.query(
        "SELECT pid FROM pg_stat_activity WHERE datname='sigeh_qa' AND usename='sigeh_qa_app' AND application_name=$1 AND wait_event_type='Lock' AND query LIKE $2",
        ["sigeh-asi-" + m.runId, "%" + fragment + "%"],
      )
    ).rows;
    if (rows.length >= n) return rows;
    await sleep(15);
  }
  throw Error("EXPECTED_WAITERS_NOT_OBSERVED");
}
async function run() {
  await free(55433);
  await free(3001);
  check(hash(fs.readFileSync(MASTER)) === MASTER_HASH, "V1_CHECKSUM");
  const sources = [
    "infra/sql/migrations/V2__iam_local.sql",
    "infra/sql/migrations/V2__iam_local.permisos-qa.sql",
    "scripts/qa/asi-qa/grants.sql",
  ];
  for (const file of sources)
    check(hash(read(file)) === m.hashes[file], "SOURCE_DRIFT");
  check(inspect("image", IMAGE).Id === IMAGE, "IMAGE_IDENTITY");
  await step("create_isolated_resources", async () => {
    m.networkId = docker([
      "network",
      "create",
      "--internal",
      "--label",
      "sigeh.asi.run=" + m.runId,
      "--label",
      "sigeh.asi.owner=CU-ASI-QA-01",
      m.networkName,
    ]);
    save();
    checkNetwork();
    const entry =
      "umask 077; mkdir -p /run/asi-secrets; head -c 48 /dev/urandom | base64 > /run/asi-secrets/bootstrap; chown -R 70:70 /run/asi-secrets; exec docker-entrypoint.sh postgres -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0 -c log_connections=off";
    m.containerId = docker([
      "create",
      "--name",
      m.containerName,
      "--label",
      "sigeh.asi.run=" + m.runId,
      "--label",
      "sigeh.asi.owner=CU-ASI-QA-01",
      "--network",
      m.networkName,
      "--publish",
      "127.0.0.1:55433:5432",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,nosuid,noexec,size=268435456",
      "--tmpfs",
      "/run/asi-secrets:rw,nosuid,noexec,size=1048576,mode=0700",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--env",
      "POSTGRES_DB=sigeh_qa",
      "--env",
      "POSTGRES_USER=sigeh_qa_bootstrap",
      "--env",
      "POSTGRES_PASSWORD_FILE=/run/asi-secrets/bootstrap",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=scram-sha-256",
      "--env",
      "POSTGRES_INITDB_ARGS=--auth-local=scram-sha-256 --auth-host=scram-sha-256",
      "--entrypoint",
      "sh",
      IMAGE,
      "-c",
      entry,
    ]);
    save();
    checkContainer();
    docker(["start", m.containerId]);
    m.targetHost =
      checkContainer().NetworkSettings.Networks[m.networkName].IPAddress;
    check(net.isIPv4(m.targetHost), "NO_ISOLATED_IP");
    save();
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      if (!checkContainer().State.Running) throw Error("EPHEMERAL_BOOT_FAILED");
      try {
        adminPassword = docker([
          "exec",
          "--user",
          "0",
          m.containerId,
          "cat",
          "/run/asi-secrets/bootstrap",
        ]);
        if (!/^[A-Za-z0-9+/]{64}$/.test(adminPassword)) {
          evidence.bootstrap_secret_format_valid = false;
          continue;
        }
        evidence.bootstrap_secret_format_valid = true;
        const c = client(adminPassword);
        try {
          await c.connect();
          owner = c;
          break;
        } catch (e) {
          evidence.bootstrap_connection_code = e.code ?? "UNKNOWN";
          await c.end().catch(() => {});
        }
      } catch {}
    }
    check(owner, "EPHEMERAL_NOT_READY");
    evidence.identity = await identity();
    check(owner.proof.sasl && owner.proof.final, "ADMIN_SCRAM_REQUIRED");
    evidence.hba = (
      await owner.query(
        "SELECT rule_number,type,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number",
      )
    ).rows;
    check(
      evidence.hba.length > 0 &&
        evidence.hba.every(
          (r) => r.error === null && r.auth_method === "scram-sha-256",
        ),
      "HBA_NOT_SCRAM",
    );
  });
  await step("fresh_schema_and_minimal_app_role", async () => {
    await identity();
    check(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='sigeh'",
        )
      ).rows[0].n === 0,
      "DATABASE_NOT_EMPTY",
    );
    await owner.query(fs.readFileSync(MASTER, "utf8"));
    await owner.query(read("infra/sql/migrations/V2__iam_local.sql"));
    appPassword = randomBytes(48).toString("base64url");
    const v = verifier(appPassword);
    check(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(
        v,
      ),
      "VERIFIER_FORMAT",
    );
    await owner.query(
      "CREATE ROLE sigeh_qa_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '" +
        v +
        "'",
    );
    await owner.query(
      "REVOKE CONNECT,TEMPORARY ON DATABASE sigeh_qa FROM PUBLIC; GRANT CONNECT ON DATABASE sigeh_qa TO sigeh_qa_app; GRANT USAGE ON SCHEMA sigeh TO sigeh_qa_app",
    );
    await owner.query(
      read("infra/sql/migrations/V2__iam_local.permisos-qa.sql"),
    );
    await owner.query(read("scripts/qa/asi-qa/grants.sql"));
    evidence.initial_inventory = await inventory();
    equal(
      evidence.initial_inventory,
      {
        tables: 58,
        indexes: 100,
        constraints: 303,
        unvalidated: 0,
        invalid_indexes: 0,
        triggers: 8,
      },
      "INITIAL_INVENTORY",
    );
    const probe = client(appPassword, "sigeh_qa_app", "sigeh-asi-probe");
    await probe.connect();
    evidence.app_scram = {
      sasl: probe.proof.sasl,
      final: probe.proof.final,
      identity: (
        await probe.query(
          "SELECT current_user,current_database(),inet_client_addr()::text,inet_server_addr()::text",
        )
      ).rows[0],
    };
    await probe.end();
    check(
      evidence.app_scram.sasl && evidence.app_scram.final,
      "APP_SCRAM_REQUIRED",
    );
    const bad = client(randomBytes(48).toString("base64url"), "sigeh_qa_app");
    let rejected = false;
    try {
      await bad.connect();
    } catch (e) {
      rejected = e.code === "28P01";
    } finally {
      await bad.end().catch(() => {});
    }
    check(rejected, "INVALID_PASSWORD_ACCEPTED");
    evidence.baseline_business = await protectedBaseline();
    evidence.trigger_hash = hash(
      JSON.stringify(
        (
          await owner.query(
            "SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal ORDER BY t.tgname",
          )
        ).rows,
      ),
    );
  });
  const r = await serve();
  let data,
    tokens = {};
  await step("synthetic_fixtures_and_real_iam", async () => {
    data = await fixtures(owner, r.hasher, m, save);
    for (const [name, u] of Object.entries(data.users))
      tokens[name] = status(
        await request("POST", "/auth/login", {
          identificador: u.identifier,
          password: u.password,
        }),
        200,
        "LOGIN_" + name,
      ).accessToken;
    evidence.fixture_counts = {
      hospitals: 2,
      services: 3,
      users: Object.keys(data.users).length,
      programs: Object.keys(data.programs).length,
    };
  });
  const capture = (
    name,
    state = "PRESENTE",
    who = "chief",
    key = randomUUID(),
  ) =>
    request(
      "PUT",
      "/programaciones/" + data.programs[name].id + "/asistencia",
      { estado: state, expectedRevision: "0" },
      tokens[who],
      key,
    );
  const counts = async (name, want) =>
    equal(await produced(data.programs[name].id), want, "EFFECTS_" + name);
  const one = { records: 1, events: 1, audits: 1 },
    zero = { records: 0, events: 0, audits: 0 };
  const keys = {},
    receipts = {};
  await step("first_capture_three_states", async () => {
    for (const [name, state] of [
      ["present", "PRESENTE"],
      ["absent", "AUSENTE"],
      ["partial", "PARCIAL"],
    ]) {
      keys[name] = randomUUID();
      receipts[name] = status(
        await capture(name, state, "chief", keys[name]),
        200,
        "CAPTURE_" + state,
      );
      check(
        receipts[name].estadoOperativo === state &&
          receipts[name].actorId === data.users.chief.id &&
          receipts[name].validacionAdministrativa === "PENDIENTE",
        "RECEIPT_CONTRACT",
      );
      await counts(name, one);
    }
  });
  await step("idempotency_and_second_capture_conflicts", async () => {
    equal(
      status(
        await capture("present", "PRESENTE", "chief", keys.present),
        200,
        "REPLAY",
      ),
      receipts.present,
      "REPLAY_ACK_CHANGED",
    );
    status(
      await capture("present", "AUSENTE", "chief", keys.present),
      409,
      "KEY_PAYLOAD_CONFLICT",
    );
    status(await capture("present", "PARCIAL"), 409, "SECOND_CAPTURE");
    await counts("present", one);
  });
  const { lockKey } = await import(
    pathToFileURL(
      path.join(
        ROOT,
        "apps/api/dist/modules/asistencia/asistencia.repository.js",
      ),
    ).href
  );
  const locker = client(
    adminPassword,
    "sigeh_qa_bootstrap",
    "sigeh-asi-locker",
  );
  await locker.connect();
  clients.add(locker);
  async function race(name, same) {
    await locker.query("BEGIN");
    try {
      await locker.query("SELECT pg_advisory_xact_lock($1::bigint)", [
        lockKey(data.programs[name].id),
      ]);
      const key = randomUUID(),
        pending = [
          capture(name, "PRESENTE", "chief", key),
          capture(name, "PRESENTE", "chief", same ? key : randomUUID()),
        ];
      await waiterCount("pg_advisory_xact_lock", 2);
      await locker.query("ROLLBACK");
      const result = await Promise.all(pending);
      if (same) {
        check(
          result.every((x) => x.status === 200),
          "CONCURRENT_RETRY_STATUS",
        );
        equal(result[0].body, result[1].body, "CONCURRENT_ACK_CHANGED");
      } else
        equal(
          result.map((x) => x.status).sort(),
          [200, 409],
          "CONCURRENT_DIFFERENT_STATUS",
        );
      await counts(name, one);
    } finally {
      await locker.query("ROLLBACK").catch(() => {});
    }
  }
  await step("two_waiting_concurrent_same_key", () => race("raceSame", true));
  await step("two_waiting_concurrent_different_keys", () =>
    race("raceDifferent", false),
  );
  await step("hospital_service_permissions_and_mandates", async () => {
    status(await capture("foreignHospital"), 404, "CROSS_HOSPITAL_A_B");
    status(
      await capture("present", "PRESENTE", "other"),
      404,
      "CROSS_HOSPITAL_B_A",
    );
    status(await capture("foreignService"), 404, "CROSS_SERVICE");
    status(await capture("encargo", "PRESENTE", "none"), 403, "NO_PERMISSION");
    status(
      await capture("encargo", "PRESENTE", "encargoNone"),
      403,
      "ENCARGO_NO_PERMISSION",
    );
    status(
      await capture("encargo", "PRESENTE", "encargoNoMandate"),
      403,
      "ENCARGO_NO_MANDATE",
    );
    status(
      await capture("encargo", "PARCIAL", "encargoOK"),
      200,
      "ENCARGO_EXPLICIT",
    );
    for (const n of ["foreignHospital", "foreignService"])
      await counts(n, zero);
  });
  await step("permission_revocation_and_ineligible_records", async () => {
    await owner.query(
      "UPDATE sigeh.usuario_roles SET vigente_hasta=clock_timestamp() WHERE usuario_rol_id=$1",
      [data.users.revoked.assignment],
    );
    status(
      await capture("revoked", "PRESENTE", "revoked"),
      403,
      "REVOKED_PERMISSION",
    );
    await counts("revoked", zero);
    status(await capture("cancelled"), 409, "CANCELLED_PROGRAM");
    status(await capture("outside"), 409, "OUTSIDE_WINDOW");
    status(await capture("legacy"), 409, "LEGACY_RECORD");
  });
  await step("lock_timeout_bounded_and_retry", async () => {
    await locker.query("BEGIN");
    try {
      await locker.query("SELECT pg_advisory_xact_lock($1::bigint)", [
        lockKey(data.programs.timeout.id),
      ]);
      const start = Date.now();
      status(await capture("timeout"), 503, "LOCK_TIMEOUT");
      evidence.lock_timeout_ms = Date.now() - start;
      check(evidence.lock_timeout_ms < 6000, "LOCK_WAIT_TOO_LONG");
      await counts("timeout", zero);
    } finally {
      await locker.query("ROLLBACK");
    }
    status(await capture("timeout"), 200, "TIMEOUT_RETRY");
    await counts("timeout", one);
  });
  await step("cancel_audit_insert_rolls_back_record_and_event", async () => {
    const key = randomUUID();
    await locker.query("BEGIN");
    try {
      await locker.query(
        "LOCK TABLE sigeh.auditoria_general IN ACCESS EXCLUSIVE MODE",
      );
      const pending = capture("rollback", "PRESENTE", "chief", key);
      const waiting = await waiterCount(
        "INSERT INTO sigeh.auditoria_general",
        1,
      );
      check(waiting.length === 1, "AMBIGUOUS_CANCEL_TARGET");
      const cancelled = (
        await owner.query(
          "SELECT pg_cancel_backend(pid) AS cancelled FROM pg_stat_activity WHERE pid=$1 AND datname='sigeh_qa' AND usename='sigeh_qa_app' AND application_name=$2 AND wait_event_type='Lock'",
          [waiting[0].pid, "sigeh-asi-" + m.runId],
        )
      ).rows[0];
      check(cancelled?.cancelled, "CANCEL_FAILED");
      status(await pending, 503, "AUDIT_CANCELLED");
    } finally {
      await locker.query("ROLLBACK");
    }
    await counts("rollback", zero);
    status(
      await capture("rollback", "PRESENTE", "chief", key),
      200,
      "ROLLBACK_RETRY",
    );
    await counts("rollback", one);
  });
  await step(
    "coordination_readback_scope_author_date_and_column_restriction",
    async () => {
      const date = (
        await owner.query(
          "SELECT to_char((inicio_programado AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day FROM sigeh.programacion_laboral WHERE programacion_id=$1",
          [data.programs.present.id],
        )
      ).rows[0].day;
      const query = `/pases-lista?hospitalId=${data.ids.ha}&servicioId=${data.ids.sa}&fecha=${date}&limit=100`;
      const body = status(
        await request("GET", query, undefined, tokens.coord),
        200,
        "COORDINATION",
      );
      for (const name of ["present", "absent", "partial"]) {
        const item = body.items.find(
          (x) => x.programacionId === data.programs[name].id,
        );
        check(
          item &&
            item.capturada &&
            item.ultimaCaptura.actorId === data.users.chief.id &&
            item.ultimaCaptura.registradoEn === receipts[name].registradoEn &&
            item.revision === receipts[name].eventoId &&
            item.validacionAdministrativa === "PENDIENTE",
          "COORDINATION_READBACK",
        );
      }
      check(
        !/rud|observaciones|password_hash|accessToken|refreshToken/.test(
          JSON.stringify(body),
        ),
        "RESPONSE_OVEREXPOSURE",
      );
      status(
        await request(
          "GET",
          query
            .replace(data.ids.ha, data.ids.hb)
            .replace(data.ids.sa, data.ids.sb),
          undefined,
          tokens.chief,
        ),
        403,
        "CROSS_SCOPE_LIST",
      );
      status(
        await capture("revoked", "PRESENTE", "coord"),
        403,
        "READER_CANNOT_CAPTURE",
      );
      const probe = client(appPassword, "sigeh_qa_app");
      await probe.connect();
      try {
        let rejected = false;
        try {
          await probe.query("SELECT rud FROM sigeh.empleados WHERE false");
        } catch (e) {
          rejected = e.code === "42501";
        }
        check(rejected, "RUD_COLUMN_READABLE");
      } finally {
        await probe.end();
      }
      evidence.readback = {
        items: body.items.length,
        states: ["PRESENTE", "AUSENTE", "PARCIAL"],
        authors_verified: true,
        timestamps_verified: true,
      };
    },
  );
  await step("immutable_events_and_structural_business_integrity", async () => {
    await owner.query("BEGIN");
    try {
      let rejected = false;
      try {
        await owner.query(
          "UPDATE sigeh.eventos_asistencia SET datos=datos WHERE evento_id=$1",
          [receipts.present.eventoId],
        );
      } catch (e) {
        rejected = e.code === "P0001";
      }
      check(rejected, "IMMUTABILITY_TRIGGER_NOT_ENFORCED");
    } finally {
      await owner.query("ROLLBACK");
    }
    equal(
      await protectedBaseline(),
      evidence.baseline_business,
      "BUSINESS_SIDE_EFFECTS",
    );
    evidence.final_inventory = await inventory();
    equal(
      evidence.final_inventory,
      evidence.initial_inventory,
      "STRUCTURAL_DRIFT",
    );
    const triggers = (
      await owner.query(
        "SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal ORDER BY t.tgname",
      )
    ).rows;
    check(
      hash(JSON.stringify(triggers)) === evidence.trigger_hash,
      "TRIGGER_CHANGED",
    );
    evidence.persisted = (
      await owner.query(
        "SELECT (SELECT count(*)::int FROM sigeh.registros_asistencia) AS records,(SELECT count(*)::int FROM sigeh.eventos_asistencia) AS events,(SELECT count(*)::int FROM sigeh.auditoria_general) AS audits",
      )
    ).rows[0];
    evidence.role = (
      await owner.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
      )
    ).rows[0];
    check(
      Object.values(evidence.role).every((v) => v === false),
      "APP_ADMIN_ATTRIBUTES",
    );
    check(
      (
        await owner.query(
          "SELECT has_schema_privilege('sigeh_qa_app','sigeh','CREATE') AS can_create,has_table_privilege('sigeh_qa_app','sigeh.eventos_asistencia','UPDATE,DELETE') AS can_change_event",
        )
      ).rows.every((r) => !r.can_create && !r.can_change_event),
      "APP_EXCESS_PRIVILEGES",
    );
    const sessions = (
      await owner.query(
        "SELECT count(*)::int AS unexpected FROM pg_stat_activity WHERE datname='sigeh_qa' AND usename NOT IN ('sigeh_qa_app','sigeh_qa_bootstrap')",
      )
    ).rows[0];
    check(sessions.unexpected === 0, "UNEXPECTED_CONNECTION");
    await identity();
  });
  await step(
    "default_disabled_in_separate_temporary_process_context",
    async () => {
      await app.close();
      app = undefined;
      pool = undefined;
      await serve(false);
      status(await request("GET", "/pases-lista"), 503, "DEFAULT_DISABLED_GET");
      status(
        await request(
          "PUT",
          "/programaciones/" + data.programs.present.id + "/asistencia",
          { estado: "PRESENTE", expectedRevision: "0" },
        ),
        503,
        "DEFAULT_DISABLED_PUT",
      );
    },
  );
  await step("no_secrets_in_postgres_logs", async () => {
    const output = cp.spawnSync("docker", ["logs", m.containerId], {
      encoding: "utf8",
      timeout: 10000,
    });
    check(output.status === 0, "LOG_INSPECTION_FAILED");
    const logs = output.stdout + output.stderr;
    for (const s of [
      adminPassword,
      appPassword,
      ...Object.values(data.users).map((u) => u.password),
      ...Object.values(tokens),
    ])
      check(!logs.includes(s), "SECRET_IN_LOGS");
    check(
      !/SCRAM-SHA-256\$[0-9]+:|\$argon2id\$|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(
        logs,
      ),
      "VERIFIER_OR_TOKEN_IN_LOGS",
    );
  });
  evidence.status = "PASS";
}
async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "plan") {
    const id = randomUUID();
    const dir = "/tmp/sigeh-asi-" + id;
    fs.mkdirSync(dir, { mode: 0o700 });
    manifestFile = path.join(dir, "manifest.json");
    check(hash(fs.readFileSync(MASTER)) === MASTER_HASH, "V1_CHECKSUM");
    m = {
      runId: id,
      phase: "PLANNED",
      createdAt: new Date().toISOString(),
      containerName: "sigeh-asi-" + id,
      networkName: "sigeh-asi-" + id,
      port: 55433,
      apiPort: 3001,
      image: IMAGE,
      storage: "tmpfs-only-no-volumes",
      hashes: { V1: MASTER_HASH },
    };
    for (const f of [
      "infra/sql/migrations/V2__iam_local.sql",
      "infra/sql/migrations/V2__iam_local.permisos-qa.sql",
      "scripts/qa/asi-qa/grants.sql",
    ])
      m.hashes[f] = hash(read(f));
    save();
    console.log(
      JSON.stringify({
        status: "PLANNED",
        manifest: manifestFile,
        container: m.containerName,
        network: m.networkName,
        storage: m.storage,
        port: m.port,
        image: IMAGE,
      }),
    );
    return;
  }
  check(
    ["run", "cleanup"].includes(command) &&
      file?.startsWith("/tmp/sigeh-asi-") &&
      path.basename(file) === "manifest.json",
    "COMMAND_REJECTED",
  );
  const st = fs.lstatSync(file);
  check(
    st.isFile() && (st.mode & 0o777) === 0o600 && st.uid === process.getuid(),
    "MANIFEST_PERMISSIONS",
  );
  manifestFile = file;
  m = JSON.parse(fs.readFileSync(file));
  check(
    /^[a-f0-9-]{36}$/.test(m.runId) &&
      m.containerName === "sigeh-asi-" + m.runId &&
      m.networkName === "sigeh-asi-" + m.runId &&
      m.image === IMAGE &&
      m.port === 55433 &&
      m.apiPort === 3001,
    "MANIFEST_IDENTITY",
  );
  if (command === "cleanup") {
    await cleanup();
    console.log(JSON.stringify({ cleanup: evidence.cleanup, runId: m.runId }));
    return;
  }
  check(
    (process.env.SIGEH_ASI_EPHEMERAL_AUTHORIZED === "1" ||
      process.argv[4] === "--authorized-CU-ASI-QA-01") &&
      m.phase === "PLANNED",
    "EXECUTION_NOT_AUTHORIZED_OR_REPEATED",
  );
  m.phase = "RUNNING";
  m.evidence = evidence;
  save();
  try {
    await run();
  } catch (e) {
    evidence.status = "FAIL";
    evidence.error = {
      phase: evidence.phase,
      code:
        typeof e.code === "string"
          ? e.code
          : /^[A-Z][A-Za-z0-9_]{0,120}$/.test(e.message ?? "")
            ? e.message
            : "SANITIZED_FAILURE",
    };
  } finally {
    try {
      await cleanup();
    } catch (e) {
      evidence.status = "BLOCKED";
      evidence.cleanup = "BLOCKED_IDENTITY_OR_REMOVAL";
      evidence.cleanup_error = /^[A-Z][A-Za-z0-9_]{0,120}$/.test(
        e.message ?? "",
      )
        ? e.message
        : "SANITIZED_CLEANUP_FAILURE";
      save();
    }
  }
  const dest = path.join(
    ROOT,
    "artifacts/permissions",
    "cu-asi-qa-01-" + m.runId + ".json",
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    JSON.stringify(
      {
        runId: m.runId,
        manifest: manifestFile,
        containerId: m.containerId,
        networkId: m.networkId,
        cluster: m.cluster,
        hashes: m.hashes,
        ...evidence,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      phase: evidence.phase,
      error: evidence.error,
      tests: evidence.tests.length,
      http_requests: evidence.http.length,
      cleanup: evidence.cleanup,
      evidence: path.relative(ROOT, dest),
    }),
  );
  if (evidence.status !== "PASS") process.exitCode = 1;
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED",
      code:
        typeof e.code === "string"
          ? e.code
          : /^[A-Z][A-Za-z0-9_]{0,120}$/.test(e.message ?? "")
            ? e.message
            : "SANITIZED_STARTUP_FAILURE",
    }),
  );
  process.exitCode = 1;
});
