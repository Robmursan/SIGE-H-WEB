// L3B-2A opt-in QA DML/HTTP tests; no DDL or grants. Uses D2.2 credential/registry mechanisms.
import fs from "node:fs";
import http from "node:http";
import cp from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import qa from "./d22-preflight.cjs";
const {
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
  default_reads_enabled: false,
};
const runId = randomUUID(),
  tag = "L3B2A-" + runId.slice(0, 8);
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
  hasher;
let catalogRows = [],
  catalogInserted = false;
const CODES = [
  "PERSONAL_CONSULTAR",
  "PROGRAMACION_CONSULTAR",
  "TABLERO_CONSULTAR",
];
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
    report.http_requests = (report.http_requests || 0) + 1;
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
async function preflight() {
  report.preflight = { container: qa.container() };
  owner = client(
    "sigeh_qa_bootstrap",
    secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
  );
  await owner.connect();
  bindAdmin(owner);
  check(owner.scram.sasl && owner.scram.final, "admin_scram");
  await owner.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  report.preflight.identity = (
    await q(
      "SELECT current_database() AS database,current_user AS role,session_user AS login,(SELECT system_identifier::text FROM pg_control_system()) AS cluster,current_setting('server_version') AS version",
    )
  )[0];
  const i = report.preflight.identity;
  check(
    i.database === "sigeh_qa" &&
      i.role === "sigeh_qa_bootstrap" &&
      i.login === i.role &&
      i.cluster === "7707094012630982690" &&
      i.version === "17.11",
    "identity",
  );
  const dir =
    "/home/robreport/.config/sigeh/backups/L3B-1-2026-11-16T01-19-29-277Z";
  const historical = JSON.parse(fs.readFileSync(dir + "/after.json"));
  same(await structure(), historical.inventory, "inventory");
  same(await direct(), historical.direct, "direct_acl");
  same(await otherAcl(), historical.other_acl, "other_acl");
  same(await fullStructure(), historical.structure, "structure");
  check(
    (
      await q(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()",
      )
    ).length === 0,
    "other_active_clients",
  );
  check(
    (
      await q(
        "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o'",
      )
    ).length === 0,
    "app_ownership",
  );
  const role = (
    await q(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
    )
  )[0];
  check(
    Object.values(role).every((x) => x === false),
    "app_attributes",
  );
  check(
    (
      await q(
        "SELECT 1 FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole",
      )
    ).length === 0,
    "app_memberships",
  );
  const grants = await q(
    "SELECT c.relname,a.attname FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='sigeh'::regnamespace AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('sigeh_qa_app',c.oid,a.attnum,'SELECT') ORDER BY 1,2",
    [
      [
        "empleados",
        "contratos",
        "adscripciones",
        "programacion_laboral",
        "horarios",
      ],
    ],
  );
  check(grants.length === 27, "effective_27");
  check(
    (
      await q(
        "SELECT 1 FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND CASE WHEN relkind='S' THEN has_sequence_privilege('sigeh_qa_app',oid,'USAGE,SELECT,UPDATE') ELSE false END",
      )
    ).length === 0,
    "sequence_rights",
  );
  const hba = await q("SELECT auth_method,error FROM pg_hba_file_rules");
  check(
    hba.length === 7 &&
      hba.every((x) => x.auth_method === "scram-sha-256" && !x.error),
    "hba",
  );
  initialRows = await snapshotRows();
  check(
    initialRows
      .filter(
        (x) =>
          ![
            "roles",
            "permisos",
            "horarios",
            "patrones_laborales",
            "patron_dias",
          ].includes(x.table),
      )
      .every((x) => x.n === "0"),
    "unexpected_preexisting_rows",
  );
  catalogRows = await q(
    "SELECT permiso_id,codigo,descripcion FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
    [CODES],
  );
  if (catalogRows.length) {
    const source = process.argv
      .find((x) => x.startsWith("--reuse-catalog-from="))
      ?.slice("--reuse-catalog-from=".length);
    check(
      source &&
        source.startsWith("/home/robreport/.config/sigeh/qa-runs/") &&
        source.endsWith("/registry.json") &&
        fs.realpathSync(source) === source,
      "catalog_provenance_required",
    );
    check(
      (fs.statSync(source).mode & 0o777) === 0o600,
      "catalog_registry_permissions",
    );
    const previous = JSON.parse(fs.readFileSync(source)).catalog_retained;
    same(
      catalogRows,
      previous.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)),
      "catalog_provenance_mismatch",
    );
    check(
      (
        await q(
          "SELECT 1 FROM sigeh.rol_permisos WHERE permiso_id=ANY($1::uuid[])",
          [catalogRows.map((x) => x.permiso_id)],
        )
      ).length === 0,
      "catalog_assigned_outside_run",
    );
  }
  const fixtureTables = [
    "permisos",
    "roles",
    "rol_permisos",
    "hospitales",
    "divisiones",
    "servicios",
    "categorias",
    "empleados",
    "contratos",
    "adscripciones",
    "horarios",
    "programacion_laboral",
    "usuarios",
    "usuario_credenciales",
    "usuario_roles",
    "usuario_roles_contexto",
    "encargo_permisos",
    "sesiones_usuario",
    "refresh_tokens_sesion",
    "iam_limites_acceso",
    "auditoria_seguridad",
  ];
  report.preflight.foreign_keys = await q(
    "SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='sigeh'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY 1,2",
    [fixtureTables],
  );
  report.preflight.triggers = await q(
    "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal",
    [fixtureTables],
  );
  check(report.preflight.triggers.length === 0, "unexpected_fixture_trigger");
  const ownerRights = await q(
    "SELECT relname,has_table_privilege(current_user,oid,'INSERT') AS insert,has_table_privilege(current_user,oid,'DELETE') AS delete FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relname=ANY($1::text[])",
    [fixtureTables],
  );
  check(
    ownerRights.length === fixtureTables.length &&
      ownerRights.every((x) => x.insert && x.delete),
    "fixture_existing_privileges",
  );
  baseline = {
    structure: await fullStructure(),
    shared: await shared(),
    direct: await direct(),
    other: await otherAcl(),
  };
  await owner.query("ROLLBACK");
  const bytes = fs.readFileSync(dir + "/sigeh_qa.before-L3B-1.dump");
  check(
    createHash("sha256").update(bytes).digest("hex") ===
      "ef2ebf036201f729ebdf51126292c1e48bee9352fe5e981d645ae68822d8c1b7" &&
      (fs.statSync(dir).mode & 0o777) === 0o700,
    "backup_checksum",
  );
  for (const args of [["--list"], ["--file=/dev/null"]]) {
    const x = cp.spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "--user",
        "postgres",
        "sigeh-qa-b1-postgres-qa-1",
        "pg_restore",
        ...args,
      ],
      { input: bytes, timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
    );
    check(x.status === 0, "backup_decode");
    if (args[0] === "--list")
      check(
        (x.stdout.toString().match(/ TABLE sigeh /g) || []).length === 58,
        "backup_tables",
      );
  }
  report.preflight.inventory = historical.inventory;
  report.preflight.acl = 100;
  report.preflight.backup = "SHA256/TOC/full decode PASS; no restore";
}
async function seed() {
  seedStarted = true;
  for (const name of [
    "ha",
    "hb",
    "da",
    "db",
    "sa",
    "sa2",
    "sb",
    "category",
    "day",
    "night",
    "role",
    "noneRole",
    "personalRole",
    "e1",
    "e2",
    "eb",
    "ex",
    "esh",
    "c1",
    "c2",
    "cb",
    "cx",
    "csa",
    "csb",
  ])
    ids[name] = randomUUID();
  for (const name of [
    "main",
    "other",
    "none",
    "service",
    "expired",
    "encargo",
    "personal",
  ])
    users[name] = {
      id: randomUUID(),
      identifier: tag + "." + name,
      password: randomBytes(24).toString("base64url"),
    };
  reg.created = {
    hospitales: [ids.ha, ids.hb],
    divisiones: [ids.da, ids.db],
    servicios: [ids.sa, ids.sa2, ids.sb],
    categorias: [ids.category],
    horarios: [ids.day, ids.night],
    roles: [ids.role, ids.noneRole, ids.personalRole],
    usuarios: Object.values(users).map((x) => x.id),
    usuario_roles: [],
    empleados: [ids.e1, ids.e2, ids.eb, ids.ex, ids.esh],
    contratos: [ids.c1, ids.c2, ids.cb, ids.cx, ids.csa, ids.csb],
    adscripciones: [],
    programacion_laboral: [],
  };
  persist();
  const hashes = {};
  for (const [name, u] of Object.entries(users))
    hashes[name] = await hasher.hash(u.password);
  report.catalog_new_count = catalogRows.length ? 0 : 3;
  if (!catalogRows.length) {
    await transaction(async () => {
      catalogRows = CODES.map((code) => ({
        permiso_id: randomUUID(),
        codigo: code,
        descripcion:
          "Consulta de " +
          {
            PERSONAL_CONSULTAR: "personal y adscripciones",
            PROGRAMACION_CONSULTAR: "programación laboral",
            TABLERO_CONSULTAR: "tablero de programación",
          }[code] +
          " con autorización organizacional vigente",
      }));
      reg.catalog_retained = catalogRows;
      persist();
      for (const p of catalogRows)
        await owner.query(
          "INSERT INTO sigeh.permisos(permiso_id,codigo,descripcion) VALUES($1,$2,$3)",
          [p.permiso_id, p.codigo, p.descripcion],
        );
    });
    catalogInserted = true;
  } else {
    reg.catalog_retained = catalogRows;
    persist();
  }
  report.catalog_registered = catalogRows.map((x) => ({
    id: x.permiso_id,
    code: x.codigo,
  }));
  await transaction(async () => {
    for (const [id, label] of [
      [ids.ha, "A"],
      [ids.hb, "B"],
    ])
      await owner.query(
        "INSERT INTO sigeh.hospitales(hospital_id,clave,nombre) VALUES($1,$2,$3)",
        [id, tag + "H" + label, tag + " HOSPITAL SINTETICO " + label],
      );
    for (const [id, h, label] of [
      [ids.da, ids.ha, "A"],
      [ids.db, ids.hb, "B"],
    ])
      await owner.query(
        "INSERT INTO sigeh.divisiones(division_id,hospital_id,clave,nombre) VALUES($1,$2,$3,$4)",
        [id, h, tag + "D" + label, tag + " DIVISION SINTETICA " + label],
      );
    for (const [id, h, d, label] of [
      [ids.sa, ids.ha, ids.da, "A1"],
      [ids.sa2, ids.ha, ids.da, "A2"],
      [ids.sb, ids.hb, ids.db, "B"],
    ])
      await owner.query(
        "INSERT INTO sigeh.servicios(servicio_id,hospital_id,division_id,clave,nombre) VALUES($1,$2,$3,$4,$5)",
        [id, h, d, tag + "S" + label, tag + " SERVICIO SINTETICO " + label],
      );
    for (const [id, label] of [
      [ids.role, "READ"],
      [ids.noneRole, "NONE"],
      [ids.personalRole, "PERSONAL"],
    ])
      await owner.query(
        "INSERT INTO sigeh.roles(rol_id,codigo,nombre) VALUES($1,$2,$3)",
        [id, tag + "." + label, tag + " ROL SINTETICO " + label],
      );
    for (const p of catalogRows) {
      await owner.query(
        "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) VALUES($1,$2)",
        [ids.role, p.permiso_id],
      );
      if (p.codigo === "PERSONAL_CONSULTAR")
        await owner.query(
          "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) VALUES($1,$2)",
          [ids.personalRole, p.permiso_id],
        );
    }
    for (const [name, u] of Object.entries(users)) {
      await owner.query(
        "INSERT INTO sigeh.usuarios(usuario_id,identificador) VALUES($1,$2)",
        [u.id, u.identifier],
      );
      await owner.query(
        "INSERT INTO sigeh.usuario_credenciales(usuario_id,password_hash,requiere_cambio) VALUES($1,$2,false)",
        [u.id, hashes[name]],
      );
      const id = randomUUID();
      reg.created.usuario_roles.push(id);
      persist();
      const service = name === "service";
      await owner.query(
        "INSERT INTO sigeh.usuario_roles(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '2 days',CASE WHEN $7 THEN clock_timestamp()-interval '1 day' ELSE NULL END)",
        [
          id,
          u.id,
          name === "none"
            ? ids.noneRole
            : name === "personal"
              ? ids.personalRole
              : ids.role,
          name === "other" ? ids.hb : ids.ha,
          service ? ids.da : null,
          service ? ids.sa : null,
          name === "expired",
        ],
      );
      ids["assignment_" + name] = id;
      await owner.query(
        "INSERT INTO sigeh.usuario_roles_contexto(usuario_rol_id,tipo,mandato_desde,mandato_hasta) VALUES($1,$2,clock_timestamp()-interval '2 days',CASE WHEN $3 THEN clock_timestamp()+interval '1 day' ELSE NULL END)",
        [id, name === "encargo" ? "ENCARGADO" : "TITULAR", name === "encargo"],
      );
      if (name === "encargo")
        await owner.query(
          "INSERT INTO sigeh.encargo_permisos(usuario_rol_id,permiso_id) VALUES($1,$2)",
          [
            id,
            catalogRows.find((x) => x.codigo === "PERSONAL_CONSULTAR")
              .permiso_id,
          ],
        );
    }
    await owner.query(
      "INSERT INTO sigeh.categorias(categoria_id,clave,nombre) VALUES($1,$2,$3)",
      [ids.category, tag + ".CAT", tag + " CATEGORIA SINTETICA"],
    );
    for (const [id, label] of [
      [ids.day, "DAY"],
      [ids.night, "NIGHT"],
    ])
      await owner.query(
        "INSERT INTO sigeh.horarios(horario_id,codigo,nombre,hora_inicio,hora_fin,cruza_medianoche) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          tag + label,
          tag + " TURNO SINTETICO",
          label === "DAY" ? "08:00" : "22:00",
          label === "DAY" ? "16:00" : "06:00",
          label === "NIGHT",
        ],
      );
    for (const key of ["e1", "e2", "eb", "ex", "esh"])
      await owner.query(
        "INSERT INTO sigeh.empleados(empleado_id,rud,nombres,primer_apellido) VALUES($1,$2,$3,$4)",
        [ids[key], tag + "." + key, tag + " SINTETICO " + key, "PRUEBA"],
      );
    for (const [c, e, h, expired] of [
      ["c1", "e1", "ha", false],
      ["c2", "e2", "ha", false],
      ["cb", "eb", "hb", false],
      ["cx", "ex", "ha", true],
      ["csa", "esh", "ha", false],
      ["csb", "esh", "hb", false],
    ])
      await owner.query(
        "INSERT INTO sigeh.contratos(contrato_id,empleado_id,hospital_id,categoria_id,tipo,inicio,fin) VALUES($1,$2,$3,$4,'OTRO','2026-11-01',$5)",
        [
          ids[c],
          ids[e],
          ids[h],
          ids.category,
          expired ? "2026-11-10" : "2026-11-30",
        ],
      );
    for (const [c, s, clase] of [
      ["c1", "sa", "NOMINAL"],
      ["c1", "sa", "OPERATIVA"],
      ["c2", "sa", "NOMINAL"],
      ["cb", "sb", "NOMINAL"],
      ["cx", "sa", "NOMINAL"],
      ["csa", "sa", "NOMINAL"],
      ["csb", "sb", "NOMINAL"],
      ["cb", "sa", "OPERATIVA"],
    ]) {
      const id = randomUUID();
      reg.created.adscripciones.push(id);
      persist();
      await owner.query(
        "INSERT INTO sigeh.adscripciones(adscripcion_id,contrato_id,servicio_id,clase,inicio) VALUES($1,$2,$3,$4,'2026-11-01')",
        [id, ids[c], ids[s], clase],
      );
    }
    const programs = [
      [
        "e1",
        "c1",
        "ha",
        "sa",
        "day",
        "2026-11-16T08:00Z",
        "2026-11-16T16:00Z",
        "PROGRAMADA",
      ],
      [
        "e2",
        "c2",
        "ha",
        "sa",
        "night",
        "2026-11-16T22:00Z",
        "2026-11-17T06:00Z",
        "PROGRAMADA",
      ],
      [
        "esh",
        "csa",
        "ha",
        "sa",
        "day",
        "2026-11-17T08:00Z",
        "2026-11-17T16:00Z",
        "CANCELADA",
      ],
      [
        "esh",
        "csb",
        "hb",
        "sb",
        "day",
        "2026-11-17T08:00Z",
        "2026-11-17T16:00Z",
        "PROGRAMADA",
      ],
      [
        "e1",
        "c1",
        "ha",
        "sa",
        "day",
        "2026-11-24T08:00Z",
        "2026-11-24T16:00Z",
        "PROGRAMADA",
      ],
      [
        "e1",
        "c1",
        "ha",
        "sa",
        "day",
        "2026-11-18T08:00Z",
        "2026-11-18T16:00Z",
        "CERRADA",
      ],
    ];
    for (const [e, c, h, s, turn, start, end, state] of programs) {
      const id = randomUUID();
      reg.created.programacion_laboral.push(id);
      persist();
      await owner.query(
        "INSERT INTO sigeh.programacion_laboral(programacion_id,empleado_id,contrato_id,hospital_id,servicio_id,horario_id,inicio_programado,fin_programado,estado,origen) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL')",
        [id, ids[e], ids[c], ids[h], ids[s], ids[turn], start, end, state],
      );
    }
  });
  fixtureCommitted = true;
  persist();
  report.fixtures = {
    run_id: runId,
    hospitals: 2,
    divisions: 2,
    services: 3,
    users: 7,
    roles: 3,
    employees: 5,
    contracts: 6,
    assignments: 8,
    programs: 6,
    category: 1,
    turns: 2,
  };
}
async function runTests() {
  const tokens = {};
  await step("login_synthetic_users_and_app_identity", async () => {
    for (const name of Object.keys(users))
      tokens[name] = (await login(name)).accessToken;
    const c = await pool.connect();
    try {
      const identity = (
        await c.query(
          "SELECT current_user AS role,current_database() AS database",
        )
      ).rows[0];
      check(
        identity.role === "sigeh_qa_app" && identity.database === "sigeh_qa",
        "runtime_identity",
      );
      report.app_identity = identity;
    } finally {
      c.release();
    }
  });
  const scope = (h = ids.ha, s = ids.sa, d) =>
    new URLSearchParams({
      hospitalId: h,
      servicioId: s,
      ...(d ? { divisionId: d } : {}),
    }).toString();
  const staff = (h, s) => scope(h, s) + "&fecha=2026-11-16";
  const window = (h, s) =>
    scope(h, s) + "&desde=2026-11-16T00:00:00Z&hasta=2026-11-23T00:00:00Z";
  const get = async (url, name = "main", want = 200) => {
    const b = status(
      await request("GET", url, undefined, name ? tokens[name] : undefined),
      want,
      "read",
    );
    noSecrets(b);
    check(
      !/"(?:rud|segundoApellido|segundo_apellido|password_hash|categoria_id|tipo)"/.test(
        JSON.stringify(b),
      ),
      "excluded_column_response",
    );
    return b;
  };
  const routes = (h, s) => [
    "/empleados?" + staff(h, s),
    "/empleados/" + ids.e1 + "?" + staff(h, s),
    "/contratos/" + ids.c1 + "/adscripciones?" + staff(h, s),
    "/programaciones?" + window(h, s),
    "/tableros/coordinacion?" + window(h, s),
  ];
  await step("health", async () => {
    const h = status(await request("GET", "/health"), 200, "health");
    check(h.database.status === "up", "health_database");
  });
  await step("staff_cursor_no_duplicates_minimal_projection", async () => {
    const first = await get("/empleados?" + staff() + "&limit=1");
    check(first.items.length === 1 && first.nextCursor, "first_cursor");
    let page = first,
      all = [...first.items];
    while (page.nextCursor) {
      check(all.length < 10, "pagination_bound");
      page = await get(
        "/empleados?" + staff() + "&limit=1&cursor=" + page.nextCursor,
      );
      all.push(...page.items);
    }
    same(
      all.map((x) => x.empleadoId).sort(),
      [ids.e1, ids.e2, ids.esh].sort(),
      "staff_membership",
    );
    check(new Set(all.map((x) => x.empleadoId)).size === 3, "distinct_roster");
    for (const x of all)
      same(
        Object.keys(x).sort(),
        ["activo", "empleadoId", "nombres", "primerApellido"].sort(),
        "minimal_employee_contract",
      );
  });
  await step("employee_detail_and_assignment_pagination", async () => {
    const b = await get("/empleados/" + ids.e1 + "?" + staff() + "&limit=1");
    check(
      b.empleado.empleadoId === ids.e1 &&
        b.adscripciones.items.length === 1 &&
        b.adscripciones.nextCursor,
      "employee_detail",
    );
    const second = await get(
      "/empleados/" +
        ids.e1 +
        "?" +
        staff() +
        "&limit=1&cursor=" +
        b.adscripciones.nextCursor,
    );
    check(
      second.adscripciones.items.length === 1 &&
        !second.adscripciones.nextCursor,
      "detail_cursor",
    );
    check(
      second.adscripciones.items[0].adscripcionId !==
        b.adscripciones.items[0].adscripcionId,
      "detail_duplicate",
    );
    const ads = await get("/contratos/" + ids.c1 + "/adscripciones?" + staff());
    check(
      ads.items.length === 2 &&
        ads.items.every(
          (x) => x.servicioId === ids.sa && x.contratoId === ids.c1,
        ),
      "contract_adscripciones",
    );
  });
  await step("hospital_b_is_independent", async () => {
    const b = await get("/empleados?" + staff(ids.hb, ids.sb), "other");
    same(
      b.items.map((x) => x.empleadoId).sort(),
      [ids.eb, ids.esh].sort(),
      "hospital_b_staff",
    );
    const p = await get("/programaciones?" + window(ids.hb, ids.sb), "other");
    check(
      p.items.length === 1 && p.items[0].servicioId === ids.sb,
      "hospital_b_program",
    );
    const d = await get(
      "/tableros/coordinacion?" + window(ids.hb, ids.sb),
      "other",
    );
    check(
      d.jornadas === 1 && d.horasPersonaProgramadas === 8,
      "hospital_b_dashboard",
    );
  });
  await step("weekly_program_cursor_window_and_turn", async () => {
    const b = await get("/programaciones?" + window() + "&limit=2");
    check(b.items.length === 2 && b.nextCursor, "program_page1");
    const c = await get(
      "/programaciones?" + window() + "&limit=2&cursor=" + b.nextCursor,
    );
    check(c.items.length === 2 && !c.nextCursor, "program_page2");
    const all = [...b.items, ...c.items];
    check(
      new Set(all.map((x) => x.programacionId)).size === 4,
      "program_duplicate",
    );
    check(
      all.every((x) => x.servicioId === ids.sa),
      "program_scope",
    );
    check(
      all.some((x) => x.turnoCodigo === tag + "NIGHT"),
      "night_turn",
    );
    check(
      all.every((x) => !x.inicioProgramado.startsWith("2026-11-24")),
      "outside_week",
    );
  });
  await step("dashboard_states_hours_not_attendance", async () => {
    const b = await get("/tableros/coordinacion?" + window());
    check(
      b.base === "PROGRAMACION_NO_ASISTENCIA_NI_COBERTURA" &&
        b.jornadas === 4 &&
        b.empleadosProgramados === 3 &&
        b.programadas === 2 &&
        b.canceladas === 1 &&
        b.cerradas === 1 &&
        b.sustituidas === 0 &&
        b.horasPersonaProgramadas === 24,
      "dashboard_expected",
    );
    const clipped = await get(
      "/tableros/coordinacion?" +
        scope() +
        "&desde=2026-11-16T12:00:00Z&hasta=2026-11-17T02:00:00Z",
    );
    check(
      clipped.jornadas === 2 && clipped.horasPersonaProgramadas === 8,
      "clipped_hours",
    );
  });
  await step("no_session_all_five_routes", async () => {
    for (const url of routes()) await get(url, null, 401);
  });
  await step("no_faculty_all_five_routes", async () => {
    for (const url of routes()) await get(url, "none", 403);
  });
  await step("expired_assignment_all_five_routes", async () => {
    for (const url of routes()) await get(url, "expired", 403);
  });
  await step("cross_hospital_all_five_routes_bidirectional", async () => {
    for (const url of routes(ids.hb, ids.sb)) await get(url, "main", 403);
    for (const url of routes()) await get(url, "other", 403);
  });
  await step("real_service_and_division_parent_required", async () => {
    await get("/empleados?" + staff(ids.ha, ids.sb), "main", 403);
    await get(
      "/empleados?" + scope(ids.ha, ids.sa, ids.db) + "&fecha=2026-11-16",
      "main",
      403,
    );
    await get("/empleados?" + staff(ids.ha, ids.sa2), "service", 403);
    const good = await get("/empleados?" + staff(), "service");
    check(good.items.length === 3, "restricted_service_positive");
  });
  await step("id_tampering_and_invisible_equals_nonexistent", async () => {
    const hidden = await get(
      "/empleados/" + ids.eb + "?" + staff(),
      "main",
      404,
    );
    const nonexistent = await get(
      "/empleados/" + randomUUID() + "?" + staff(),
      "main",
      404,
    );
    same(hidden, nonexistent, "id_existence_leak");
    const c = await get("/contratos/" + ids.cb + "/adscripciones?" + staff());
    check(c.items.length === 0, "foreign_contract_rows");
  });
  await step(
    "shared_employee_and_inconsistent_assignment_excluded",
    async () => {
      const a = await get("/empleados/" + ids.esh + "?" + staff());
      check(
        a.adscripciones.items.length === 1 &&
          a.adscripciones.items[0].contratoId === ids.csa,
        "shared_employee_a",
      );
      const b = await get(
        "/empleados/" + ids.esh + "?" + staff(ids.hb, ids.sb),
        "other",
      );
      check(
        b.adscripciones.items.length === 1 &&
          b.adscripciones.items[0].contratoId === ids.csb,
        "shared_employee_b",
      );
      const inconsistent = await get(
        "/contratos/" + ids.cb + "/adscripciones?" + staff(),
      );
      check(inconsistent.items.length === 0, "inconsistent_assignment_rows");
    },
  );
  await step("expired_contract_and_empty_service", async () => {
    await get("/empleados/" + ids.ex + "?" + staff(), "main", 404);
    const c = await get("/contratos/" + ids.cx + "/adscripciones?" + staff());
    check(c.items.length === 0, "expired_contract_visible");
    const empty = await get("/empleados?" + staff(ids.ha, ids.sa2));
    check(empty.items.length === 0 && !empty.nextCursor, "empty_roster");
    const d = await get("/tableros/coordinacion?" + window(ids.ha, ids.sa2));
    check(
      d.jornadas === 0 && d.horasPersonaProgramadas === 0,
      "empty_dashboard",
    );
  });
  await step("dto_filters_pagination_and_168h_bounds", async () => {
    for (const tail of [
      "&limit=101",
      "&limit=0",
      "&cursor=bad",
      "&unexpected=1",
    ])
      await get("/empleados?" + staff() + tail, "main", 400);
    await get("/empleados?" + scope() + "&fecha=2026-02-30", "main", 400);
    await get(
      "/empleados?hospitalId=" + ids.ha + "&fecha=2026-11-16",
      "main",
      400,
    );
    await get(
      "/programaciones?" +
        scope() +
        "&desde=2026-11-16T00:00:00Z&hasta=2026-11-24T00:00:00Z",
      "main",
      400,
    );
    await get(
      "/programaciones?" +
        scope() +
        "&desde=2026-11-16T00:00:00&hasta=2026-11-17T00:00:00",
      "main",
      400,
    );
  });
  await step("faculty_separation_and_encargado_explicit_only", async () => {
    check(
      (await get("/empleados?" + staff(), "personal")).items.length === 3,
      "personal_positive",
    );
    await get("/programaciones?" + window(), "personal", 403);
    await get("/tableros/coordinacion?" + window(), "personal", 403);
    check(
      (await get("/empleados?" + staff(), "encargo")).items.length === 3,
      "encargo_personal_positive",
    );
    await get("/programaciones?" + window(), "encargo", 403);
    await get("/tableros/coordinacion?" + window(), "encargo", 403);
  });
  await step(
    "revoked_permission_and_expired_mandate_with_existing_jwt",
    async () => {
      await transaction(async () => {
        await owner.query(
          "DELETE FROM sigeh.rol_permisos WHERE rol_id=$1 AND permiso_id=$2",
          [
            ids.personalRole,
            catalogRows.find((x) => x.codigo === "PERSONAL_CONSULTAR")
              .permiso_id,
          ],
        );
        await owner.query(
          "UPDATE sigeh.usuario_roles_contexto SET mandato_hasta=clock_timestamp()-interval '1 second' WHERE usuario_rol_id=$1",
          [ids.assignment_main],
        );
      });
      await get("/empleados?" + staff(), "personal", 403);
      for (const url of routes()) await get(url, "main", 403);
    },
  );
  await step("sql_denial_rud_whole_row_and_no_extra_columns", async () => {
    for (const sql of [
      "SELECT rud FROM sigeh.empleados WHERE false",
      "SELECT segundo_apellido FROM sigeh.empleados WHERE false",
      "SELECT tipo,categoria_id FROM sigeh.contratos WHERE false",
      "SELECT * FROM sigeh.empleados WHERE false",
    ]) {
      let code;
      try {
        await pool.query(sql);
      } catch (e) {
        code = e.code;
      }
      check(code === "42501", "protected_column_denial");
    }
  });
  await step("authorization_audit_allow_deny", async () => {
    await registerProduced();
    const events = await q(
      "SELECT evento,resultado,count(*)::int AS n FROM sigeh.auditoria_seguridad WHERE evento_id=ANY($1::uuid[]) GROUP BY 1,2 ORDER BY 1,2",
      [reg.audit],
    );
    check(
      events.some(
        (x) => x.evento === "AUTHORIZATION" && x.resultado === "ALLOW",
      ) &&
        events.some(
          (x) => x.evento === "AUTHORIZATION" && x.resultado === "DENY",
        ),
      "authorization_audit",
    );
    report.audit_summary = events;
  });
  await step("openapi_http_real", async () => {
    const spec = status(
      await request("GET", "/docs/openapi.json"),
      200,
      "openapi",
    );
    check(spec.openapi.startsWith("3."), "openapi");
    const paths = [
      "/api/v1/empleados",
      "/api/v1/empleados/{empleadoId}",
      "/api/v1/contratos/{contratoId}/adscripciones",
      "/api/v1/programaciones",
      "/api/v1/tableros/coordinacion",
    ];
    check(
      paths.every((p) => spec.paths[p]?.get?.operationId),
      "read_paths_contract",
    );
    report.tested_paths = paths;
  });
}
async function cleanup() {
  if (!fixtureCommitted) return;
  await registerProduced();
  const rows = [
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
    [
      "programacion_laboral",
      "programacion_id",
      reg.created.programacion_laboral,
    ],
    ["adscripciones", "adscripcion_id", reg.created.adscripciones],
    ["contratos", "contrato_id", reg.created.contratos],
    ["empleados", "empleado_id", reg.created.empleados],
    ["horarios", "horario_id", reg.created.horarios],
    ["categorias", "categoria_id", reg.created.categorias],
    ["servicios", "servicio_id", reg.created.servicios],
    ["divisiones", "division_id", reg.created.divisiones],
    ["hospitales", "hospital_id", reg.created.hospitales],
  ];
  report.cleanup_counts = {};
  await transaction(async () => {
    for (const [t, c, values] of rows) {
      const type = t === "iam_limites_acceso" ? "text" : "uuid";
      const r = await owner.query(
        `DELETE FROM sigeh.${t} WHERE ${c}::${type}=ANY($1::${type}[]) AND xmin::text=ANY($2::text[])`,
        [values, [...xids]],
      );
      report.cleanup_counts[t] = r.rowCount;
    }
  });
  const expected = initialRows.map((x) => ({
    ...x,
    n:
      x.table === "permisos"
        ? String(Number(x.n) + report.catalog_new_count)
        : x.n,
  }));
  same(await snapshotRows(), expected, "cleanup_row_counts");
  const catalog = await q(
    "SELECT permiso_id,codigo,descripcion FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
    [CODES],
  );
  same(
    catalog,
    catalogRows.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)),
    "retained_catalog",
  );
  check(
    (
      await q(
        "SELECT 1 FROM sigeh.rol_permisos WHERE permiso_id=ANY($1::uuid[])",
        [catalogRows.map((x) => x.permiso_id)],
      )
    ).length === 0,
    "retained_catalog_assigned",
  );
  report.cleanup = "complete_except_three_unassigned_catalog_entries";
  report.audit_residue = 0;
}
async function main() {
  check(process.env.SIGEH_L3B2A_QA === "1", "explicit_qa_opt_in_required");
  await preflight();
  if (process.argv.includes("--preflight-only")) {
    report.status = "PASS_PREFLIGHT";
    return;
  }
  const base = "/home/robreport/.config/sigeh/qa-runs";
  if (!fs.existsSync(base)) fs.mkdirSync(base, { mode: 0o700 });
  check((fs.statSync(base).mode & 0o777) === 0o700, "registry_permissions");
  manifestDir = base + "/" + runId;
  fs.mkdirSync(manifestDir, { mode: 0o700 });
  report.registry = manifestDir + "/registry.json";
  persist();
  fs.writeFileSync(
    manifestDir + "/before.json",
    JSON.stringify({ baseline, rows: initialRows }, null, 2),
    { mode: 0o600 },
  );
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
    L3A_READS_ENABLED: "true",
    IAM_JWT_ISSUER: "urn:sigeh:l3b2a:" + runId,
    IAM_JWT_AUDIENCE: "sigeh-l3b2a-" + runId,
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
  const { PasswordHasher } = await import(
    ROOT + "/apps/api/dist/modules/iam/domain/password-hasher.js"
  );
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  configureApp(app);
  hasher = app.get(PasswordHasher);
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

  report.phase = "seed";
  await seed();
  await app.listen(0, "127.0.0.1");
  serverPort = app.getHttpServer().address().port;
  check(app.getHttpServer().address().address === "127.0.0.1", "loopback_only");
  report.temporary_server = "127.0.0.1:ephemeral";
  await runTests();
  report.status = "PASS";
  report.phase = "complete";
}
try {
  await main();
} catch (e) {
  report.failed_phase = report.phase;
  report.error = /^[A-Za-z0-9_]+$/.test(e.code || e.message)
    ? e.code || e.message
    : "sanitized_error";
  report.status = catalogInserted || fixtureCommitted ? "PARCIAL" : "BLOQUEADO";
} finally {
  if (app)
    await app.close().catch(() => {
      report.close_error = true;
      report.status = "PARCIAL";
    });
  if (owner) {
    try {
      check(!report.close_error, "temporary_api_not_closed");
      await owner.query("ROLLBACK");
      if (seedStarted && !fixtureCommitted && reg.created.usuarios)
        fixtureCommitted =
          Number(
            (
              await q(
                "SELECT count(*) AS n FROM sigeh.usuarios WHERE usuario_id=ANY($1::uuid[]) AND xmin::text=ANY($2::text[])",
                [reg.created.usuarios, [...xids]],
              )
            )[0].n,
          ) > 0;
      await cleanup();
      if (baseline) {
        same(await fullStructure(), baseline.structure, "final_structure");
        same(await shared(), baseline.shared, "final_shared");
        same(await direct(), baseline.direct, "final_acl");
        same(await otherAcl(), baseline.other, "final_other_acl");
        report.final_inventory = await structure();
        report.final_direct_entries = (await direct()).length;
        report.final_rows = await snapshotRows();
      }
    } catch (e) {
      report.cleanup = "BLOCKED";
      report.cleanup_error = /^[A-Za-z0-9_]+$/.test(e.code || e.message)
        ? e.code || e.message
        : "sanitized_error";
      report.status = "PARCIAL";
    }
    await owner.end().catch(() => {});
  }
  delete process.env.JWT_SECRET;
  delete process.env.DB_PASSWORD;
  process.env.IAM_V2_ENABLED = "false";
  process.env.L3A_READS_ENABLED = "false";
  report.default_iam_enabled = false;
  report.default_reads_enabled = false;
  report.finished_at = new Date().toISOString();
  report.test_groups_passed = report.tests.length;
  if (manifestDir) {
    persist();
    fs.writeFileSync(
      manifestDir + "/result.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
  }
  fs.writeFileSync(
    "/tmp/sigeh-l3b2a-result.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  const brief = {
    ...report,
    preflight: report.preflight
      ? {
          ...report.preflight,
          foreign_keys: report.preflight.foreign_keys?.length,
        }
      : undefined,
  };
  delete brief.final_rows;
  console.log(JSON.stringify(brief));
  process.exitCode = report.status.startsWith("PASS") ? 0 : 1;
}
