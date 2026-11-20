// Offline policy/storage/query-contract tests. No PostgreSQL client/server is invoked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  TARGET,
  CODES,
  options,
  authorize,
  uuid,
  readPrivate,
  writePrivate,
  directory,
  acquire,
  contextFromProfile,
  demoEnvironment,
  sanitize,
} from "./qa-demo-core.mjs";
import { deleteOwned, cleanupPlan } from "./qa-demo-cleanup.mjs";
import { createFixtures } from "./qa-demo-fixtures.mjs";
test("execution opt-in gates all operational commands; plan is inert", () => {
  for (const cmd of ["prepare", "serve", "verify", "smoke", "cleanup"])
    assert.throws(() => authorize(cmd, {}), /QA_EXECUTION_NOT_AUTHORIZED/);
  authorize("plan", {});
  authorize("prepare", { SIGEH_QA_DEMO_EXECUTE: "1" });
});
test("CLI rejects destination overrides, path traversal, unknown modes and durations", () => {
  assert.deepEqual(options(["prepare"]), { command: "prepare", minutes: 60 });
  for (const args of [
    ["prepare", "--host", "localhost"],
    ["serve", "--run", "../../other"],
    ["prepare", "--minutes", "0"],
    ["prepare", "--minutes", "121"],
    ["prepare", "--minutes", "NaN"],
    ["serve", "--run", randomUUID(), "--minutes", "15"],
    ["DROP"],
  ])
    assert.throws(() => options(args));
  assert.equal(uuid(randomUUID()).length, 36);
  assert.equal(TARGET.database, "sigeh_qa");
  assert.equal(TARGET.port, 55432);
});
test("private files are 0700/0600, atomic JSON and symlink reads rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sigeh-demo-policy-"));
  try {
    fs.chmodSync(dir, 0o700);
    directory(dir);
    const file = path.join(dir, "state.json");
    writePrivate(file, { runId: "SYNTHETIC" });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(readPrivate(file), { runId: "SYNTHETIC" });
    const link = path.join(dir, "link");
    fs.symlinkSync(file, link);
    assert.throws(() => readPrivate(link));
    fs.chmodSync(file, 0o644);
    assert.throws(() => readPrivate(file));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("live command locks cannot be stolen or killed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sigeh-demo-lock-"));
  try {
    const file = path.join(dir, "command.lock"),
      id = randomUUID(),
      release = acquire(file, id);
    assert.throws(() => acquire(file, id), /RUN_COMMAND_ACTIVE/);
    assert.throws(() => acquire(file, randomUUID()), /FOREIGN_LOCK/);
    release();
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("process config is fixed QA/loopback policy; no ambient secret copied", () => {
  const m = {
      runId: randomUUID(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
    env = demoEnvironment(m, "/external/qa-app/password");
  assert.equal(env.DB_HOST, "127.0.0.1");
  assert.equal(env.DB_PORT, "55432");
  assert.equal(env.DB_USER, "sigeh_qa_app");
  assert.equal(env.DB_PASSWORD, undefined);
  assert.equal(env.JWT_SECRET, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.IAM_V2_ENABLED, "true");
  assert.equal(env.L3A_READS_ENABLED, "true");
  assert.throws(
    () => demoEnvironment({ ...m, expiresAt: new Date(0).toISOString() }, "/x"),
    /RUN_EXPIRED/,
  );
});
test("profile contexts require an explicit read faculty and real service scope", () => {
  const a = {
      hospitalId: randomUUID(),
      divisionId: randomUUID(),
      servicioId: randomUUID(),
    },
    b = {
      hospitalId: randomUUID(),
      divisionId: randomUUID(),
      servicioId: randomUUID(),
    };
  assert.deepEqual(
    contextFromProfile(
      {
        assignments: [
          { scope: a, permissions: [CODES[0]] },
          { scope: b, permissions: [] },
          { scope: { ...b, servicioId: null }, permissions: [CODES[0]] },
        ],
      },
      CODES[0],
    ),
    [a],
  );
});
test("cleanup identifiers are fixed, uses exact IDs+xmin and locks before delete", async () => {
  const calls = [],
    admin = {
      query: async (sql, args) => {
        calls.push({ sql, args });
        return {
          rows: sql.startsWith("SELECT") ? [{ xid: "10" }] : [],
          rowCount: 1,
        };
      },
    },
    ids = [randomUUID()];
  await deleteOwned(admin, "empleados", "empleado_id", ids, ["10"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FOR UPDATE$/);
  assert.match(calls[1].sql, /AND xmin::text=ANY/);
  assert.deepEqual(calls[1].args, [ids, ["10"]]);
  const count = calls.length;
  await assert.rejects(
    deleteOwned(admin, "empleados; DROP", "empleado_id", ids, ["10"]),
    /DELETE_IDENTIFIER_REJECTED/,
  );
  assert.equal(calls.length, count);
});
test("cleanup stops before DELETE when another transaction touched an owned ID", async () => {
  const calls = [],
    admin = {
      query: async (sql) => {
        calls.push(sql);
        return { rows: [{ xid: "999" }] };
      },
    };
  await assert.rejects(
    deleteOwned(admin, "empleados", "empleado_id", [randomUUID()], ["10"]),
    /FOREIGN_FIXTURE_WRITER/,
  );
  assert.equal(calls.length, 1);
});
test("fixture SQL contract is synthetic, bounded and uses only existing read faculties (mock)", async () => {
  const m = {
      runId: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    calls = [];
  let credentials;
  const owner = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      return { rows: [] };
    },
  };
  const catalogRows = CODES.map((codigo) => ({
    codigo,
    permiso_id: randomUUID(),
  }));
  await createFixtures({
    owner,
    hasher: { hash: async () => "UNIT_TEST_ONLY_NOT_A_CREDENTIAL" },
    m,
    persist: () => {},
    transaction: async (work) => work(),
    saveCredentials: (value) => {
      credentials = value;
    },
    catalogRows,
  });
  assert.equal(m.state, "PREPARED");
  assert.equal(m.created.hospitales.length, 2);
  assert.equal(m.created.usuarios.length, 7);
  assert.equal(m.created.programacion_laboral.length, 6);
  assert(calls.every((x) => x.sql.startsWith("INSERT INTO sigeh.")));
  assert(
    !calls.some((x) =>
      /INSERT INTO sigeh\.permisos\b|GRANT|ALTER|DROP|TRUNCATE/.test(x.sql),
    ),
  );
  const links = calls.filter((x) =>
    x.sql.startsWith("INSERT INTO sigeh.rol_permisos"),
  );
  assert(
    links.every((x) => catalogRows.some((p) => p.permiso_id === x.args[1])),
  );
  const assignments = calls.filter((x) =>
    x.sql.startsWith("INSERT INTO sigeh.usuario_roles("),
  );
  assert.equal(assignments.length, 7);
  assert(
    assignments.every(
      (x) => x.args[4] && x.args[5] && x.args[7] === m.expiresAt,
    ),
  );
  assert(new Set(assignments.map((x) => x.args[3])).size === 2);
  const contexts = calls.filter((x) =>
    x.sql.startsWith("INSERT INTO sigeh.usuario_roles_contexto"),
  );
  assert(contexts.every((x) => x.args[2] === m.expiresAt));
  for (const u of Object.values(credentials))
    assert(!JSON.stringify(m).includes(u.password));
  assert(!JSON.stringify(m).includes("UNIT_TEST_ONLY_NOT_A_CREDENTIAL"));
});
test("CLI/static safeguards are present; original runner is not the interactive tool", () => {
  const code = fs.readFileSync(
    new URL("./qa-demo.mjs", import.meta.url),
    "utf8",
  );
  assert.match(code, /app\.listen\(3000,\s*["']127\.0\.0\.1/);
  assert.match(code, /QA_IDENTITY_REJECTED/);
  assert.match(code, /qa\.container\(\)/);
  assert.match(code, /CLEANUP_ROWS_NOT_BASELINE/);
  assert.match(code, /CLOSE_REQUIRES_RECOVERY/);
  assert(
    !/docker\s+(start|restart|stop|compose)|GRANT\s|REVOKE\s|CREATE ROLE|TRUNCATE|DROP CASCADE/.test(
      code,
    ),
  );
});
test("error summaries never echo arbitrary credentials or SQL text", () => {
  assert.equal(sanitize(Error("secret-value with spaces")), "QA_DEMO_FAILED");
  assert.equal(sanitize(Error("ALLUPPERCASESECRET")), "QA_DEMO_FAILED");
  assert.equal(sanitize({ code: "28P01", message: "sensitive" }), "28P01");
});

test("cleanup maps dependent rows to registered parent IDs in FK order, never catalog", () => {
  const users = [randomUUID()],
    roles = [randomUUID()],
    assignments = [randomUUID()],
    m = { created: { usuarios: users, roles, usuario_roles: assignments } };
  const plan = cleanupPlan(m, []),
    tables = plan.map((row) => row[0]);
  for (const [table, ids] of [
    ["usuario_credenciales", users],
    ["encargo_permisos", assignments],
    ["usuario_roles_contexto", assignments],
    ["rol_permisos", roles],
  ])
    assert.deepEqual(plan.find((row) => row[0] === table)[2], ids);
  assert(tables.indexOf("usuario_credenciales") < tables.indexOf("usuarios"));
  assert(
    tables.indexOf("usuario_roles_contexto") < tables.indexOf("usuario_roles"),
  );
  assert(tables.indexOf("usuario_roles") < tables.indexOf("roles"));
  assert(!tables.includes("permisos"));
});

test("fixed IAM settings validate with the existing compiled class, without AppModule", async () => {
  const { IamSettings } = await import(
    new URL(
      "../../apps/api/dist/modules/iam/domain/iam-settings.js",
      import.meta.url,
    )
  );
  const m = {
      runId: randomUUID(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
    values = {
      ...demoEnvironment(m, "/external/qa-app/password"),
      JWT_SECRET: (randomUUID() + randomUUID()).replaceAll("-", ""),
    };
  const settings = new IamSettings({
    get: (key, fallback) => values[key] ?? fallback,
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.memory, 19456);
  assert.equal(settings.passes, 2);
  assert.equal(settings.accessSeconds, 300);
  assert.equal(settings.absoluteSeconds, 3600);
});
