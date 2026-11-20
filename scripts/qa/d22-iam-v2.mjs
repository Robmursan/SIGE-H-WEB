// Opt-in real QA test. Never loaded by npm test/test:e2e. No migrations or grants.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import qa from "./d22-preflight.cjs";
const {
  inspectQA,
  client,
  secret,
  bindAdmin,
  q,
  structure,
  fullStructure,
  shared,
  direct,
  otherAcl,
} = qa;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(ROOT + "/apps/api/package.json");
const check = (ok, code) => {
  if (!ok) throw new Error(code);
};
const same = (a, b, code) =>
  check(JSON.stringify(a) === JSON.stringify(b), code);
const report = {
  status: "BLOQUEADO",
  phase: "preflight",
  tests: [],
  cleanup: "not_required",
  default_iam_enabled: false,
};
const runId = randomUUID(),
  tag = "D22-" + runId.slice(0, 8);
const reg = {
  runId,
  created: {},
  xids: [],
  sessions: [],
  refresh: [],
  audit: [],
  buckets: [],
};
let owner,
  app,
  pool,
  manifestDir,
  baseline,
  initialRows,
  fixtureCommitted = false,
  seedStarted = false,
  serverPort,
  settings,
  hasher,
  iam,
  jwt;
const xids = new Set(),
  users = {},
  ids = {};
function persist() {
  if (!manifestDir) return;
  reg.xids = [...xids];
  const file = manifestDir + "/registry.json",
    tmp = manifestDir + "/registry.tmp";
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

async function transaction(work) {
  await owner.query("BEGIN");
  try {
    const id = (await owner.query("SELECT pg_current_xact_id()::text AS id"))
      .rows[0].id;
    xids.add(String(BigInt(id) & 0xffffffffn));
    persist();
    const r = await work();
    const c = await owner.query("COMMIT");
    check(c.command === "COMMIT", "fixture_commit_unconfirmed");
    return r;
  } catch (e) {
    await owner.query("ROLLBACK");
    throw e;
  }
}
async function step(name, work) {
  report.phase = name;
  await work();
  report.tests.push({ name, status: "PASS" });
}
function request(method, url, body, token, source = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: serverPort,
        path: url.startsWith("/docs/") ? url : "/api/v1" + url,
        method,
        localAddress: source,
        headers: {
          ...(text
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(text),
              }
            : {}),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            reject(new Error("http_non_json"));
          }
        });
      },
    );
    req.setTimeout(8000, () => req.destroy(new Error("http_timeout")));
    req.on("error", () => reject(new Error("http_transport_failed")));
    req.end(text);
  });
}
function status(r, wanted, label) {
  check(r.status === wanted, label + "_http_" + r.status);
  return r.body;
}
function noSecrets(body) {
  const text = JSON.stringify(body);
  for (const u of Object.values(users))
    check(!text.includes(u.password), "password_in_response");
  check(
    !/password_hash|refreshToken|accessToken/.test(text),
    "stored_material_in_profile",
  );
}
async function login(name) {
  const u = users[name];
  const r = await request("POST", "/auth/login", {
    identificador: u.identifier,
    password: u.password,
  });
  const b = status(r, 200, "login_" + name);
  same(
    Object.keys(b).sort(),
    [
      "accessToken",
      "expiresIn",
      "refreshToken",
      "sessionId",
      "tokenType",
    ].sort(),
    "token_contract",
  );
  check(
    b.tokenType === "Bearer" && b.expiresIn > 0 && b.expiresIn <= 60,
    "access_ttl",
  );
  reg.sessions.push(b.sessionId);
  persist();
  return b;
}
async function expectDenied(work) {
  let code;
  try {
    await work();
  } catch (e) {
    code = e.status || e.getStatus?.();
  }
  check(code === 403, "authorization_expected_403");
}
async function snapshotRows() {
  const tables = await q(
    "SELECT relname FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' ORDER BY relname",
  );
  const rows = [];
  for (const t of tables)
    rows.push({
      table: t.relname,
      n: (
        await q('SELECT count(*)::text AS n FROM sigeh."' + t.relname + '"')
      )[0].n,
    });
  return rows;
}
async function registerProduced() {
  if (!fixtureCommitted) return;
  const tx = [...xids];
  reg.sessions = (
    await q(
      "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE usuario_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
      [Object.values(users).map((u) => u.id), tx],
    )
  ).map((r) => r.sesion_id);
  reg.refresh = (
    await q(
      "SELECT token_id FROM sigeh.refresh_tokens_sesion WHERE sesion_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
      [reg.sessions, tx],
    )
  ).map((r) => r.token_id);
  reg.audit = (
    await q(
      "SELECT evento_id FROM sigeh.auditoria_seguridad WHERE xmin::text=ANY($1::text[])",
      [tx],
    )
  ).map((r) => r.evento_id);
  reg.buckets = (
    await q(
      "SELECT clave_hash FROM sigeh.iam_limites_acceso WHERE xmin::text=ANY($1::text[])",
      [tx],
    )
  ).map((r) => r.clave_hash);
  persist();
}
async function seed() {
  seedStarted = true;
  ids.ha = randomUUID();
  ids.hb = randomUUID();
  ids.da = randomUUID();
  ids.da2 = randomUUID();
  ids.db = randomUUID();
  ids.sa = randomUUID();
  ids.sa2 = randomUUID();
  ids.sa3 = randomUUID();
  ids.sb = randomUUID();
  ids.role = randomUUID();
  ids.read = randomUUID();
  ids.manage = randomUUID();
  for (const name of [
    "main",
    "other",
    "division",
    "service",
    "encargo",
    "expired",
    "future",
    "expiredRole",
    "none",
    "inactive",
    "limit",
  ])
    users[name] = {
      id: randomUUID(),
      identifier: tag + "." + name,
      password: randomBytes(24).toString("base64url"),
    };
  reg.created = {
    hospitales: [ids.ha, ids.hb],
    divisiones: [ids.da, ids.da2, ids.db],
    servicios: [ids.sa, ids.sa2, ids.sa3, ids.sb],
    roles: [ids.role],
    permisos: [ids.read, ids.manage],
    usuarios: Object.values(users).map((u) => u.id),
    usuario_roles: [],
  };
  persist();
  const existingCatalog = await q(
    "SELECT permiso_id FROM sigeh.permisos WHERE codigo=$1",
    ["CATALOGOS_ADMINISTRAR"],
  );
  ids.catalog = existingCatalog[0]?.permiso_id ?? randomUUID();
  if (!existingCatalog.length) reg.created.permisos.push(ids.catalog);
  persist();
  const hashes = {};
  for (const [name, u] of Object.entries(users))
    hashes[name] = await hasher.hash(u.password);
  await transaction(async () => {
    for (const [id, suffix] of [
      [ids.ha, "A"],
      [ids.hb, "B"],
    ])
      await owner.query(
        "INSERT INTO sigeh.hospitales(hospital_id,clave,nombre) VALUES($1,$2,$3)",
        [id, tag + "-H" + suffix, tag + " HOSPITAL SINTETICO " + suffix],
      );
    for (const [id, h, s] of [
      [ids.da, ids.ha, "A1"],
      [ids.da2, ids.ha, "A2"],
      [ids.db, ids.hb, "B1"],
    ])
      await owner.query(
        "INSERT INTO sigeh.divisiones(division_id,hospital_id,clave,nombre) VALUES($1,$2,$3,$4)",
        [id, h, tag + "-D" + s, tag + " DIVISION SINTETICA " + s],
      );
    for (const [id, h, d, s] of [
      [ids.sa, ids.ha, ids.da, "A1"],
      [ids.sa2, ids.ha, ids.da, "A2"],
      [ids.sa3, ids.ha, ids.da2, "A3"],
      [ids.sb, ids.hb, ids.db, "B1"],
    ])
      await owner.query(
        "INSERT INTO sigeh.servicios(servicio_id,hospital_id,division_id,clave,nombre) VALUES($1,$2,$3,$4,$5)",
        [id, h, d, tag + "-S" + s, tag + " SERVICIO SINTETICO " + s],
      );
    await owner.query(
      "INSERT INTO sigeh.roles(rol_id,codigo,nombre) VALUES($1,$2,$3)",
      [ids.role, tag + ".ROL", tag + " ROL SINTETICO"],
    );
    for (const [id, code] of [
      [ids.read, tag + ".LEER"],
      [ids.manage, tag + ".GESTIONAR"],
    ]) {
      await owner.query(
        "INSERT INTO sigeh.permisos(permiso_id,codigo,descripcion) VALUES($1,$2,$3)",
        [id, code, tag + " PERMISO SINTETICO"],
      );
      await owner.query(
        "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) VALUES($1,$2)",
        [ids.role, id],
      );
    }
    if (!existingCatalog.length)
      await owner.query(
        "INSERT INTO sigeh.permisos(permiso_id,codigo,descripcion) VALUES($1,$2,$3)",
        [
          ids.catalog,
          "CATALOGOS_ADMINISTRAR",
          tag + " PERMISO CATALOGO SINTETICO",
        ],
      );
    await owner.query(
      "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) VALUES($1,$2)",
      [ids.role, ids.catalog],
    );
    for (const [name, u] of Object.entries(users)) {
      await owner.query(
        "INSERT INTO sigeh.usuarios(usuario_id,identificador,activo) VALUES($1,$2,$3)",
        [u.id, u.identifier, name !== "inactive"],
      );
      await owner.query(
        "INSERT INTO sigeh.usuario_credenciales(usuario_id,password_hash,requiere_cambio) VALUES($1,$2,false)",
        [u.id, hashes[name]],
      );
      if (["none", "inactive", "limit"].includes(name)) continue;
      const assignment = randomUUID();
      reg.created.usuario_roles.push(assignment);
      persist();
      const h = name === "other" ? ids.hb : ids.ha,
        d = name === "division" || name === "service" ? ids.da : null,
        s = name === "service" ? ids.sa : null;
      await owner.query(
        "INSERT INTO sigeh.usuario_roles(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '2 days',CASE WHEN $7::boolean THEN clock_timestamp()-interval '1 day' ELSE NULL END)",
        [assignment, u.id, ids.role, h, d, s, name === "expiredRole"],
      );
      await owner.query(
        "INSERT INTO sigeh.usuario_roles_contexto(usuario_rol_id,tipo,mandato_desde,mandato_hasta) VALUES($1,$2,CASE WHEN $3::boolean THEN clock_timestamp()+interval '1 day' ELSE clock_timestamp()-interval '2 days' END,CASE WHEN $4::boolean THEN clock_timestamp()-interval '1 day' WHEN $5::boolean THEN clock_timestamp()+interval '3 days' ELSE NULL END)",
        [
          assignment,
          name === "encargo" ? "ENCARGADO" : "TITULAR",
          name === "future",
          name === "expired",
          name === "encargo",
        ],
      );
      if (name === "encargo")
        await owner.query(
          "INSERT INTO sigeh.encargo_permisos(usuario_rol_id,permiso_id) VALUES($1,$2)",
          [assignment, ids.read],
        );
    }
  });
  fixtureCommitted = true;
  report.fixtures = {
    run_id: runId,
    hospitals: 2,
    divisions: 3,
    services: 4,
    users: 11,
    employees: 0,
  };
  persist();
}
async function lockTests(s1, s2) {
  const a = client(
    "sigeh_qa_app",
    secret("/home/robreport/.config/sigeh/qa-app/password"),
  );
  const b = client(
    "sigeh_qa_app",
    secret("/home/robreport/.config/sigeh/qa-app/password"),
  );
  b.connectionParameters.options +=
    " -c lock_timeout=200 -c statement_timeout=1500";
  try {
    await a.connect();
    await b.connect();
    await a.query("BEGIN READ WRITE");
    await b.query("BEGIN READ WRITE");
    await a.query(
      "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE sesion_id=$1 FOR UPDATE",
      [s1],
    );
    let code;
    try {
      await b.query(
        "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE sesion_id=$1 FOR UPDATE",
        [s1],
      );
    } catch (e) {
      code = e.code;
    }
    check(code === "55P03", "bounded_lock_timeout");
    await b.query("ROLLBACK");
    await a.query("ROLLBACK");
    await a.query("BEGIN READ WRITE");
    await a.query(
      "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE sesion_id=$1 FOR UPDATE",
      [s1],
    );
    await a.query(
      "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE sesion_id=$1 FOR UPDATE",
      [s2],
    );
    await a.query("ROLLBACK");
  } finally {
    await a.query("ROLLBACK").catch(() => {});
    await b.query("ROLLBACK").catch(() => {});
    await a.end();
    await b.end();
  }
  report.locks = {
    timeout_sqlstate: "55P03",
    bounded_ms: 200,
    locks_released: true,
  };
}
async function concurrentRefresh(token) {
  await owner.query("BEGIN");
  await owner.query(
    "SELECT sesion_id FROM sigeh.sesiones_usuario WHERE sesion_id=$1 FOR UPDATE",
    [token.sessionId],
  );
  const running = [
    request(
      "POST",
      "/auth/refresh",
      { refreshToken: token.refreshToken },
      undefined,
      "127.0.0.1",
    ),
    request(
      "POST",
      "/auth/refresh",
      { refreshToken: token.refreshToken },
      undefined,
      "127.0.0.2",
    ),
  ];
  let locked = 0;
  try {
    for (let n = 0; n < 15; n++) {
      await q("SELECT pg_stat_clear_snapshot()");
      locked = +(
        await q(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname='sigeh_qa' AND application_name='sigeh-api' AND wait_event_type='Lock'",
        )
      )[0].n;
      if (locked >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    await owner.query("ROLLBACK");
  }
  const r = await Promise.all(running);
  same(
    r.map((x) => x.status).sort(),
    [200, 401],
    "concurrent_refresh_outcomes",
  );
  check(locked >= 2, "real_concurrent_family_lock");
  const winner = r.find((x) => x.status === 200).body;
  status(
    await request("GET", "/auth/me", undefined, winner.accessToken),
    401,
    "replay_revokes_winner",
  );
  const rows = await q(
    "SELECT count(*) FILTER(WHERE consumido_en IS NOT NULL)::int AS consumed,count(*) FILTER(WHERE revocado_en IS NULL)::int AS usable,count(*)::int AS total FROM sigeh.refresh_tokens_sesion WHERE sesion_id=$1",
    [token.sessionId],
  );
  check(
    rows[0].consumed === 1 && rows[0].usable === 0 && rows[0].total === 2,
    "atomic_rotation_state",
  );
  report.concurrent_refresh = {
    requests: 2,
    waiting_connections: locked,
    statuses: [200, 401],
    consumed: 1,
    usable: 0,
  };
}
async function runTests() {
  await step("argon2id", async () => {
    const c = (
      await q(
        "SELECT password_hash FROM sigeh.usuario_credenciales WHERE usuario_id=$1",
        [users.main.id],
      )
    )[0];
    check(
      c.password_hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"),
      "argon_parameters",
    );
    check(
      await hasher.verify(users.main.password, c.password_hash),
      "argon_verify",
    );
    check(
      !(await hasher.verify(
        randomBytes(24).toString("base64url"),
        c.password_hash,
      )),
      "argon_wrong_password",
    );
  });
  let first, caller, target, parallel, other;
  await step("login_invalid_inactive_and_rate_limit", async () => {
    const wrong = randomBytes(24).toString("base64url");
    const one = await request("POST", "/auth/login", {
      identificador: users.limit.identifier,
      password: wrong,
    });
    status(one, 401, "invalid_password");
    const inactive = await request("POST", "/auth/login", {
      identificador: users.inactive.identifier,
      password: users.inactive.password,
    });
    status(inactive, 401, "inactive");
    same(one.body, inactive.body, "generic_auth_failure");
    for (let n = 0; n < 4; n++)
      status(
        await request("POST", "/auth/login", {
          identificador: users.limit.identifier,
          password: wrong,
        }),
        401,
        "invalid_attempt",
      );
    status(
      await request("POST", "/auth/login", {
        identificador: users.limit.identifier,
        password: users.limit.password,
      }),
      429,
      "persistent_rate_limit",
    );
  });
  await step("login_profile_persistent_session", async () => {
    first = await login("main");
    const profile = status(
      await request("GET", "/auth/me", undefined, first.accessToken),
      200,
      "profile",
    );
    check(profile.usuarioId === users.main.id, "profile_subject");
    noSecrets(profile);
    const stored = (
      await q(
        "SELECT t.token_hash,s.usuario_id FROM sigeh.sesiones_usuario s JOIN sigeh.refresh_tokens_sesion t USING(sesion_id) WHERE s.sesion_id=$1",
        [first.sessionId],
      )
    )[0];
    check(
      stored.usuario_id === users.main.id &&
        stored.token_hash ===
          createHash("sha256").update(first.refreshToken).digest("hex"),
      "persist_hash_only",
    );
  });
  await step("refresh_rotation_and_replay", async () => {
    const r = status(
      await request("POST", "/auth/refresh", {
        refreshToken: first.refreshToken,
      }),
      200,
      "rotate",
    );
    check(r.refreshToken !== first.refreshToken, "fresh_refresh");
    status(
      await request("POST", "/auth/refresh", {
        refreshToken: first.refreshToken,
      }),
      401,
      "replay",
    );
    status(
      await request("GET", "/auth/me", undefined, r.accessToken),
      401,
      "replay_invalidates_access",
    );
  });
  await step("logout", async () => {
    const t = await login("main");
    status(
      await request("POST", "/auth/logout", undefined, t.accessToken),
      204,
      "logout",
    );
    status(
      await request("GET", "/auth/me", undefined, t.accessToken),
      401,
      "logout_denial",
    );
  });
  await step("sessions_individual_revocation_and_foreign_denial", async () => {
    caller = await login("main");
    target = await login("main");
    other = await login("other");
    const list = status(
      await request("GET", "/auth/sessions", undefined, caller.accessToken),
      200,
      "sessions",
    );
    check(
      list.every((s) => typeof s.sessionId === "string"),
      "session_dto",
    );
    noSecrets(list);
    status(
      await request(
        "DELETE",
        "/auth/sessions/" + target.sessionId,
        undefined,
        other.accessToken,
      ),
      404,
      "foreign_revoke",
    );
    status(
      await request(
        "DELETE",
        "/auth/sessions/" + target.sessionId,
        undefined,
        caller.accessToken,
      ),
      204,
      "own_revoke",
    );
    status(
      await request("GET", "/auth/me", undefined, target.accessToken),
      401,
      "revoked_access",
    );
  });
  await step("jwt_valid_altered_expired_wrong_audience", async () => {
    status(
      await request("GET", "/auth/me", undefined, caller.accessToken),
      200,
      "jwt_valid",
    );
    const [h, p, s] = caller.accessToken.split(".");
    const altered = h + "." + p + "." + (s[0] === "A" ? "B" : "A") + s.slice(1);
    status(
      await request("GET", "/auth/me", undefined, altered),
      401,
      "jwt_altered",
    );
    const now = Math.floor(Date.now() / 1000),
      claims = {
        sub: users.main.id,
        sid: caller.sessionId,
        jti: randomUUID(),
        token_use: "access",
        iat: now - 61,
        exp: now - 1,
      };
    const expired = jwt.sign(claims, {
      secret: settings.secret,
      algorithm: "HS256",
      issuer: settings.issuer,
      audience: settings.audience,
    });
    status(
      await request("GET", "/auth/me", undefined, expired),
      401,
      "jwt_expired",
    );
    const wrong = jwt.sign(
      { ...claims, iat: now, exp: now + 60 },
      {
        secret: settings.secret,
        algorithm: "HS256",
        issuer: settings.issuer,
        audience: "wrong-synthetic-audience",
      },
    );
    status(
      await request("GET", "/auth/me", undefined, wrong),
      401,
      "jwt_audience",
    );
  });
  await step("organization_scope_and_mandates", async () => {
    const auth = async (name, permission, scope, allow) => {
      let token;
      if (name === "main") token = caller;
      else if (name === "other") token = other;
      else token = await login(name);
      const principal = await iam.verify("Bearer " + token.accessToken);
      if (allow) await iam.authorize(principal, permission, scope);
      else
        await expectDenied(() => iam.authorize(principal, permission, scope));
    };
    await auth("main", tag + ".LEER", { hospitalId: ids.ha }, true);
    await auth("main", tag + ".LEER", { hospitalId: ids.hb }, false);
    const d = await login("division"),
      dp = await iam.verify("Bearer " + d.accessToken);
    await iam.authorize(dp, tag + ".LEER", {
      hospitalId: ids.ha,
      divisionId: ids.da,
    });
    await expectDenied(() =>
      iam.authorize(dp, tag + ".LEER", {
        hospitalId: ids.ha,
        divisionId: ids.da2,
      }),
    );
    const s = await login("service"),
      sp = await iam.verify("Bearer " + s.accessToken);
    await iam.authorize(sp, tag + ".LEER", {
      hospitalId: ids.ha,
      servicioId: ids.sa,
    });
    await expectDenied(() =>
      iam.authorize(sp, tag + ".LEER", {
        hospitalId: ids.ha,
        servicioId: ids.sa2,
      }),
    );
    const e = await login("encargo"),
      ep = await iam.verify("Bearer " + e.accessToken);
    await iam.authorize(ep, tag + ".LEER", { hospitalId: ids.ha });
    await expectDenied(() =>
      iam.authorize(ep, tag + ".GESTIONAR", { hospitalId: ids.ha }),
    );
    await iam.authorize(
      await iam.verify("Bearer " + caller.accessToken),
      tag + ".GESTIONAR",
      { hospitalId: ids.ha },
    );
    for (const name of ["expired", "future", "expiredRole", "none"])
      await auth(name, tag + ".LEER", { hospitalId: ids.ha }, false);
  });
  await step("organization_http_references", async () => {
    status(await request("GET", "/hospitales"), 401, "org_no_session");
    const h = status(
      await request("GET", "/hospitales", undefined, caller.accessToken),
      200,
      "hospital_refs",
    );
    same(
      h.items.map((x) => x.id),
      [ids.ha],
      "hospital_scope_filter",
    );
    check(
      !JSON.stringify(h).includes("nombre") &&
        !JSON.stringify(h).includes("clave"),
      "no_ungranted_descriptive_columns",
    );
    status(
      await request(
        "GET",
        "/hospitales?hospitalId=" + ids.hb,
        undefined,
        caller.accessToken,
      ),
      403,
      "hospital_outside_scope",
    );
    const b = status(
      await request("GET", "/hospitales", undefined, other.accessToken),
      200,
      "other_hospital_refs",
    );
    same(
      b.items.map((x) => x.id),
      [ids.hb],
      "other_hospital_filter",
    );
    const div = status(
      await request(
        "GET",
        "/hospitales/" + ids.ha + "/divisiones",
        undefined,
        caller.accessToken,
      ),
      200,
      "division_refs",
    );
    same(
      div.items.map((x) => x.id).sort(),
      [ids.da, ids.da2].sort(),
      "division_ids",
    );
    status(
      await request("GET", "/servicios", undefined, caller.accessToken),
      400,
      "required_hospital",
    );
    status(
      await request(
        "GET",
        "/servicios?hospitalId=" + ids.ha + "&limit=101",
        undefined,
        caller.accessToken,
      ),
      400,
      "page_limit",
    );
    status(
      await request(
        "GET",
        "/servicios?hospitalId=" + ids.ha + "&isAdmin=true",
        undefined,
        caller.accessToken,
      ),
      400,
      "forbid_extra_filter",
    );
    const firstPage = status(
      await request(
        "GET",
        "/servicios?hospitalId=" + ids.ha + "&limit=1",
        undefined,
        caller.accessToken,
      ),
      200,
      "services_page",
    );
    check(
      firstPage.items.length === 1 &&
        firstPage.nextCursor === firstPage.items[0].id,
      "keyset_page",
    );
    const secondPage = status(
      await request(
        "GET",
        "/servicios?hospitalId=" +
          ids.ha +
          "&limit=100&cursor=" +
          firstPage.nextCursor,
        undefined,
        caller.accessToken,
      ),
      200,
      "services_next_page",
    );
    same(
      [...firstPage.items, ...secondPage.items].map((x) => x.id),
      [ids.sa, ids.sa2, ids.sa3].sort(),
      "stable_keyset_order",
    );
    const d = await login("division"),
      dpage = status(
        await request(
          "GET",
          "/servicios?hospitalId=" + ids.ha,
          undefined,
          d.accessToken,
        ),
        200,
        "division_services",
      );
    same(
      dpage.items.map((x) => x.id).sort(),
      [ids.sa, ids.sa2].sort(),
      "division_service_filter",
    );
    const t = await login("service"),
      spage = status(
        await request(
          "GET",
          "/servicios?hospitalId=" + ids.ha,
          undefined,
          t.accessToken,
        ),
        200,
        "service_subset",
      );
    same(
      spage.items.map((x) => x.id),
      [ids.sa],
      "service_filter",
    );
    const dp = status(
      await request(
        "GET",
        "/hospitales/" + ids.ha + "/divisiones",
        undefined,
        t.accessToken,
      ),
      200,
      "service_parent_division",
    );
    same(
      dp.items.map((x) => x.id),
      [ids.da],
      "inferred_parent_filter",
    );
    status(
      await request(
        "GET",
        "/servicios?hospitalId=" + ids.ha + "&servicioId=" + ids.sa2,
        undefined,
        t.accessToken,
      ),
      403,
      "outside_service_denied",
    );
    const none = await login("none");
    status(
      await request("GET", "/hospitales", undefined, none.accessToken),
      403,
      "default_org_denial",
    );
    const e = await login("encargo");
    status(
      await request("GET", "/hospitales", undefined, e.accessToken),
      403,
      "encargo_no_implicit_catalog_permission",
    );
  });
  await step("inactive_user_invalidates_existing_access", async () => {
    const token = await login("none");
    status(
      await request("GET", "/auth/me", undefined, token.accessToken),
      200,
      "active_before_toggle",
    );
    await transaction(async () => {
      const r = await owner.query(
        "UPDATE sigeh.usuarios SET activo=false WHERE usuario_id=$1 AND identificador=$2",
        [users.none.id, users.none.identifier],
      );
      check(r.rowCount === 1, "owned_user_toggle");
    });
    status(
      await request("GET", "/auth/me", undefined, token.accessToken),
      401,
      "inactive_existing_access",
    );
  });
  await step("bounded_statement_timeout", async () => {
    const timer = client(
      "sigeh_qa_app",
      secret("/home/robreport/.config/sigeh/qa-app/password"),
    );
    timer.connectionParameters.options += " -c statement_timeout=100";
    let code;
    try {
      await timer.connect();
      try {
        await timer.query("SELECT pg_sleep(0.5)");
      } catch (e) {
        code = e.code;
      }
    } finally {
      await timer.end();
    }
    check(code === "57014", "statement_timeout_expected");
    report.statement_timeout = { sqlstate: code, bounded_ms: 100 };
  });
  await step("refresh_concurrency_atomicity_and_replay", async () => {
    parallel = await login("main");
    await concurrentRefresh(parallel);
  });
  await step("concurrent_individual_revocation", async () => {
    const results = await Promise.all([
      request(
        "DELETE",
        "/auth/sessions/" + other.sessionId,
        undefined,
        other.accessToken,
      ),
      request(
        "DELETE",
        "/auth/sessions/" + other.sessionId,
        undefined,
        other.accessToken,
      ),
    ]);
    check(
      results.every((r) => [204, 401].includes(r.status)) &&
        results.some((r) => r.status === 204),
      "concurrent_revoke_status",
    );
    status(
      await request("GET", "/auth/me", undefined, other.accessToken),
      401,
      "concurrent_revoked",
    );
  });
  await step("bounded_locks_and_rollback", async () => {
    await lockTests(caller.sessionId, target.sessionId);
    const before = (
      await q(
        "SELECT revocada_en FROM sigeh.sesiones_usuario WHERE sesion_id=$1",
        [caller.sessionId],
      )
    )[0].revocada_en;
    await pool.connect().then(async (c) => {
      try {
        await c.query("BEGIN READ WRITE");
        await c.query(
          "UPDATE sigeh.sesiones_usuario SET revocada_en=clock_timestamp(),motivo_revocacion='D22_ROLLBACK' WHERE sesion_id=$1",
          [caller.sessionId],
        );
        throw new Error("synthetic_failure");
      } catch (e) {
        check(e.message === "synthetic_failure", "rollback_test_error");
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
    });
    const after = (
      await q(
        "SELECT revocada_en FROM sigeh.sesiones_usuario WHERE sesion_id=$1",
        [caller.sessionId],
      )
    )[0].revocada_en;
    check(after === null && before === null, "rollback_keeps_state");
  });
  await step("audit_integrity", async () => {
    await registerProduced();
    const events = await q(
      "SELECT evento,resultado,count(*)::int AS n FROM sigeh.auditoria_seguridad WHERE evento_id=ANY($1::uuid[]) GROUP BY 1,2",
      [reg.audit],
    );
    for (const [event, result] of [
      ["LOGIN_OK", "ALLOW"],
      ["LOGIN_INVALID", "DENY"],
      ["LOGIN_LIMIT", "DENY"],
      ["REFRESH_OK", "ALLOW"],
      ["REFRESH_REPLAY", "DENY"],
      ["AUTHORIZATION", "ALLOW"],
      ["AUTHORIZATION", "DENY"],
      ["LOGOUT", "ALLOW"],
      ["SESSION_REVOKED", "ALLOW"],
    ])
      check(
        events.some(
          (e) => e.evento === event && e.resultado === result && e.n > 0,
        ),
        "missing_audit_event",
      );
    report.audit_summary = events;
  });
}
async function cleanup() {
  if (!fixtureCommitted) return;
  await registerProduced();
  const data = [
    ["auditoria_seguridad", "evento_id", reg.audit],
    ["refresh_tokens_sesion", "token_id", reg.refresh],
    ["sesiones_usuario", "sesion_id", reg.sessions],
    ["iam_limites_acceso", "clave_hash", reg.buckets],
    ["usuario_credenciales", "usuario_id", reg.created.usuarios],
    ["encargo_permisos", "usuario_rol_id", reg.created.usuario_roles],
    ["usuario_roles_contexto", "usuario_rol_id", reg.created.usuario_roles],
    ["usuario_roles", "usuario_rol_id", reg.created.usuario_roles],
    ["usuarios", "usuario_id", reg.created.usuarios],
    ["rol_permisos", "rol_id", reg.created.roles],
    ["roles", "rol_id", reg.created.roles],
    ["permisos", "permiso_id", reg.created.permisos],
    ["servicios", "servicio_id", reg.created.servicios],
    ["divisiones", "division_id", reg.created.divisiones],
    ["hospitales", "hospital_id", reg.created.hospitales],
  ];
  report.cleanup_counts = {};
  await transaction(async () => {
    for (const [table, column, values] of data) {
      const type = table === "iam_limites_acceso" ? "text" : "uuid";
      const r = await owner.query(
        `DELETE FROM sigeh.${table} WHERE ${column}::${type}=ANY($1::${type}[]) AND xmin::text=ANY($2::text[])`,
        [values, [...xids]],
      );
      report.cleanup_counts[table] = r.rowCount;
    }
  });
  same(await snapshotRows(), initialRows, "cleanup_row_counts");
  report.cleanup = "complete";
}
async function main() {
  check(process.env.SIGEH_D22_QA === "1", "explicit_qa_opt_in_required");
  const pf = await inspectQA();
  check(pf.status === "PASS", "preflight_failed");
  report.preflight = {
    identity: pf.identity,
    grants: pf.grants,
    inventory: pf.inventory,
    backup: pf.backup,
  };
  owner = client(
    "sigeh_qa_bootstrap",
    secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
  );
  await owner.connect();
  bindAdmin(owner);
  initialRows = await snapshotRows();
  baseline = {
    structure: await fullStructure(),
    shared: await shared(),
    direct: await direct(),
    other: await otherAcl(),
  };
  const base = "/home/robreport/.config/sigeh/qa-runs";
  if (!fs.existsSync(base)) fs.mkdirSync(base, { mode: 0o700 });
  check((fs.statSync(base).mode & 0o777) === 0o700, "registry_permissions");
  manifestDir = base + "/" + runId;
  fs.mkdirSync(manifestDir, { mode: 0o700 });
  report.registry = manifestDir + "/registry.json";
  persist();
  for (const key of ["DATABASE_URL", "DB_PASSWORD", "NODE_OPTIONS"])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    DB_HOST: "127.0.0.1",
    DB_PORT: "55432",
    DB_NAME: "sigeh_qa",
    DB_USER: "sigeh_qa_app",
    DB_SCHEMA: "sigeh",
    DB_PASSWORD_FILE: "/home/robreport/.config/sigeh/qa-app/password",
    DB_STATEMENT_TIMEOUT_MS: "5000",
    DB_LOCK_TIMEOUT_MS: "1500",
    DB_IDLE_IN_TX_TIMEOUT_MS: "30000",
    DB_QUERY_TIMEOUT_MS: "10000",
    IAM_V2_ENABLED: "true",
    IAM_JWT_ISSUER: "urn:sigeh:d22:" + runId,
    IAM_JWT_AUDIENCE: "sigeh-d22-" + runId,
    JWT_SECRET: randomBytes(48).toString("base64url"),
    JWT_EXPIRATION: "15m",
    IAM_ACCESS_SECONDS: "60",
    IAM_ACCOUNT_ATTEMPTS: "5",
    IAM_IP_ATTEMPTS: "120",
    SWAGGER_ENABLED: "true",
  });
  const { Logger } = require("@nestjs/common");
  Logger.overrideLogger(false);
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = await import(ROOT + "/apps/api/dist/app.module.js");
  const { configureApp } = await import(ROOT + "/apps/api/dist/main.js");
  const { PG_POOL } = await import(
    ROOT + "/apps/api/dist/database/postgres.service.js"
  );
  const { IamSettings } = await import(
    ROOT + "/apps/api/dist/modules/iam/domain/iam-settings.js"
  );
  const { PasswordHasher } = await import(
    ROOT + "/apps/api/dist/modules/iam/domain/password-hasher.js"
  );
  const { IamService } = await import(
    ROOT + "/apps/api/dist/modules/iam/application/iam.service.js"
  );
  const { JwtService } = require("@nestjs/jwt");
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  configureApp(app);
  settings = app.get(IamSettings);
  hasher = app.get(PasswordHasher);
  iam = app.get(IamService);
  jwt = app.get(JwtService);
  pool = app.get(PG_POOL);
  pool.on("connect", (c) => {
    const original = c.query.bind(c);
    c.query = function (text, ...args) {
      const r = original(text, ...args);
      const sql = typeof text === "string" ? text : text.text;
      if (/^BEGIN READ WRITE$/i.test(sql) && typeof args.at(-1) !== "function")
        return r.then(async (answer) => {
          const t = (await original("SELECT pg_current_xact_id()::text AS id"))
            .rows[0].id;
          xids.add(String(BigInt(t) & 0xffffffffn));
          persist();
          return answer;
        });
      return r;
    };
  });
  await seed();
  await app.listen(0, "127.0.0.1");
  serverPort = app.getHttpServer().address().port;
  check(app.getHttpServer().address().address === "127.0.0.1", "loopback_only");
  report.temporary_server = "127.0.0.1:ephemeral";
  const health = status(await request("GET", "/health"), 200, "health");
  check(health.database.status === "up", "health_database");
  await runTests();
  const openapi = status(
    await request("GET", "/docs/openapi.json"),
    200,
    "openapi",
  );
  check(openapi.openapi.startsWith("3."), "openapi_version");
  for (const [route, methods] of Object.entries(openapi.paths))
    for (const op of Object.values(methods)) {
      op["x-sigeh-status"] =
        route.includes("/auth/") ||
        route.includes("hospitales") ||
        route.endsWith("/servicios")
          ? "qa-tested-disabled-by-default"
          : "local-tested";
    }
  openapi["x-sigeh-deployment"] =
    "IAM disabled by default; QA temporary test only";
  fs.mkdirSync(ROOT + "/artifacts/openapi", { recursive: true });
  fs.writeFileSync(
    ROOT + "/artifacts/openapi/sigeh-v1.json",
    JSON.stringify(openapi, null, 2) + "\n",
  );
  report.openapi = "artifacts/openapi/sigeh-v1.json";
  report.phase = "complete";
  report.status = "PASS";
}
try {
  await main();
} catch (e) {
  report.failed_phase = report.phase;
  report.error = /^[A-Za-z0-9_]+$/.test(e.code || e.message)
    ? e.code || e.message
    : "sanitized_error";
  report.status = fixtureCommitted ? "FAIL" : "BLOQUEADO";
} finally {
  if (app)
    await app.close().catch(() => {
      report.close_error = true;
      report.status = "FAIL";
    });
  if (owner) {
    try {
      check(!report.close_error, "temporary_api_not_closed");
      await owner.query("ROLLBACK");
      if (seedStarted && !fixtureCommitted && reg.created.usuarios) {
        fixtureCommitted =
          Number(
            (
              await q(
                "SELECT count(*) AS n FROM sigeh.usuarios WHERE usuario_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
                [reg.created.usuarios, [...xids]],
              )
            )[0].n,
          ) > 0;
      }
      await cleanup();
      if (baseline) {
        same(await fullStructure(), baseline.structure, "final_structure");
        same(await shared(), baseline.shared, "final_shared");
        same(await direct(), baseline.direct, "final_grants");
        same(await otherAcl(), baseline.other, "final_other_acl");
        report.final_inventory = await structure();
      }
    } catch (e) {
      report.cleanup = "BLOCKED";
      report.cleanup_error = /^[A-Za-z0-9_]+$/.test(e.code || e.message)
        ? e.code || e.message
        : "sanitized_error";
      report.status = "FAIL";
    }
    await owner.end().catch(() => {});
  }
  delete process.env.JWT_SECRET;
  process.env.IAM_V2_ENABLED = "false";
  report.default_iam_enabled = false;
  if (manifestDir) {
    persist();
    fs.writeFileSync(
      manifestDir + "/result.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
  }
  fs.writeFileSync(
    "/tmp/sigeh-d22-result.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
