// Pure QA-demo policy and local private storage. No database/server side effects on import.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
export const TARGET = Object.freeze({
  container: "sigeh-qa-b1-postgres-qa-1",
  database: "sigeh_qa",
  cluster: "7707094012630982690",
  role: "sigeh_qa_app",
  host: "127.0.0.1",
  port: 55432,
});
export const CODES = [
  "PERSONAL_CONSULTAR",
  "PROGRAMACION_CONSULTAR",
  "TABLERO_CONSULTAR",
];
export const BASE = path.join(os.homedir(), ".config/sigeh/qa-demo");
export class PolicyError extends Error {
  constructor(code) {
    super(code);
    this.policyCode = code;
  }
}
export function check(ok, code) {
  if (!ok) throw new PolicyError(code);
}
export function same(a, b, code) {
  check(JSON.stringify(a) === JSON.stringify(b), code);
}
export function uuid(value) {
  check(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    ),
    "INVALID_RUN_ID",
  );
  return value;
}
export function options(args) {
  const [command, ...rest] = args;
  check(
    ["plan", "prepare", "serve", "verify", "smoke", "cleanup"].includes(
      command,
    ),
    "INVALID_COMMAND",
  );
  const o = { command };
  for (let i = 0; i < rest.length; i++) {
    check(["--run", "--minutes"].includes(rest[i]), "UNKNOWN_OPTION");
    const key = rest[i].slice(2);
    check(o[key] === undefined && rest[i + 1] !== undefined, "INVALID_OPTION");
    o[key] = rest[++i];
  }
  if (command === "prepare") {
    check(!o.run, "PREPARE_GENERATES_RUN_ID");
    o.minutes = Number(o.minutes ?? 60);
    check(
      Number.isInteger(o.minutes) && o.minutes >= 15 && o.minutes <= 120,
      "INVALID_DURATION",
    );
  } else {
    check(o.minutes === undefined, "DURATION_PREPARE_ONLY");
    if (command !== "plan") uuid(o.run ?? "");
  }
  return o;
}
export function authorize(command, env = process.env) {
  if (command !== "plan")
    check(env.SIGEH_QA_DEMO_EXECUTE === "1", "QA_EXECUTION_NOT_AUTHORIZED");
}
export function directory(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
  const s = fs.lstatSync(dir);
  check(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === process.getuid() &&
      (s.mode & 0o777) === 0o700 &&
      fs.realpathSync(dir) === dir,
    "PRIVATE_DIRECTORY_REJECTED",
  );
}
export function readPrivate(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    check(
      s.isFile() &&
        s.uid === process.getuid() &&
        (s.mode & 0o777) === 0o600 &&
        s.size < 16 * 1024 * 1024,
      "PRIVATE_FILE_REJECTED",
    );
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } finally {
    fs.closeSync(fd);
  }
}
export function writePrivate(file, value) {
  directory(path.dirname(file));
  const tmp = file + "." + randomUUID() + ".tmp";
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  const d = fs.openSync(path.dirname(file), "r");
  try {
    fs.fsyncSync(d);
  } finally {
    fs.closeSync(d);
  }
}
export function loadRun(id) {
  uuid(id);
  directory(BASE);
  const dir = path.join(BASE, id);
  check(fs.existsSync(dir), "RUN_NOT_FOUND");
  directory(dir);
  const m = readPrivate(path.join(dir, "manifest.json"));
  check(m.runId === id && m.version === 1, "MANIFEST_IDENTITY");
  same(m.target, TARGET, "MANIFEST_DESTINATION");
  return { dir, m };
}
export function acquire(file, runId) {
  try {
    const fd = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ runId, pid: process.pid }));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const lock = readPrivate(file);
    check(lock.runId === runId, "FOREIGN_LOCK");
    let dead = false;
    try {
      process.kill(lock.pid, 0);
    } catch (e) {
      check(e.code === "ESRCH", "LOCK_OWNER_UNKNOWN");
      dead = true;
    }
    check(dead, "RUN_COMMAND_ACTIVE");
    fs.unlinkSync(file);
    return acquire(file, runId);
  }
  return () => {
    const lock = readPrivate(file);
    check(lock.runId === runId && lock.pid === process.pid, "LOCK_CHANGED");
    fs.unlinkSync(file);
  };
}
export function contextFromProfile(profile, permission) {
  return (profile.assignments ?? [])
    .filter(
      (a) =>
        a.permissions?.includes(permission) &&
        a.scope?.hospitalId &&
        a.scope?.servicioId,
    )
    .map((a) => ({
      hospitalId: a.scope.hospitalId,
      divisionId: a.scope.divisionId,
      servicioId: a.scope.servicioId,
    }));
}
export function demoEnvironment(run, appPasswordFile) {
  check(Date.parse(run.expiresAt) > Date.now(), "RUN_EXPIRED");
  return {
    NODE_ENV: "test",
    DB_HOST: TARGET.host,
    DB_PORT: String(TARGET.port),
    DB_NAME: TARGET.database,
    DB_USER: TARGET.role,
    DB_SCHEMA: "sigeh",
    DB_PASSWORD_FILE: appPasswordFile,
    DB_POOL_MAX: "4",
    DB_STATEMENT_TIMEOUT_MS: "5000",
    DB_LOCK_TIMEOUT_MS: "1500",
    DB_QUERY_TIMEOUT_MS: "10000",
    IAM_V2_ENABLED: "true",
    L3A_READS_ENABLED: "true",
    IAM_JWT_ISSUER: "urn:sigeh:qa-demo:" + run.runId,
    IAM_JWT_AUDIENCE: "sigeh-qa-demo-" + run.runId,
    IAM_ACCESS_SECONDS: "300",
    IAM_ABSOLUTE_SECONDS: "3600",
    IAM_IDLE_SECONDS: "900",
    IAM_ACCOUNT_ATTEMPTS: "5",
    IAM_IP_ATTEMPTS: "120",
    IAM_ATTEMPT_WINDOW_SECONDS: "900",
    IAM_PASSWORD_MIN_LENGTH: "12",
    IAM_PASSWORD_MAX_LENGTH: "128",
    IAM_ARGON_MEMORY_KIB: "19456",
    IAM_ARGON_PASSES: "2",
    IAM_HASH_CONCURRENCY: "2",
    JWT_EXPIRATION: "15m",
    SWAGGER_ENABLED: "true",
  };
}
export function sanitize(error) {
  if (
    error instanceof PolicyError &&
    /^[A-Z][A-Z0-9_]{2,80}$/.test(error.policyCode)
  )
    return error.policyCode;
  if (
    /^[0-9A-Z]{5}$/.test(error?.code ?? "") ||
    [
      "ENOENT",
      "EACCES",
      "EPERM",
      "EEXIST",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ELOOP",
    ].includes(error?.code)
  )
    return error.code;
  return "QA_DEMO_FAILED";
}
