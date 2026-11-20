// Adapted from the validated L3B-2A seed. Only existing catalog codes; no GRANT/DDL.
import { randomUUID, randomBytes } from "node:crypto";
import { check } from "./qa-demo-core.mjs";
export async function createFixtures({
  owner,
  hasher,
  m,
  persist,
  transaction,
  saveCredentials,
  catalogRows,
}) {
  const reg = m,
    runId = m.runId,
    tag = "QADEMO-" + runId.slice(0, 8),
    users = {},
    ids = {};
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
  check(catalogRows.length === 3, "EXISTING_FACULTIES_REQUIRED");
  m.catalog = catalogRows;
  m.accounts = Object.entries(users).map(([name, u]) => ({
    name,
    id: u.id,
    identifier: u.identifier,
  }));
  m.ids = ids;
  saveCredentials(
    Object.fromEntries(
      Object.entries(users).map(([name, u]) => [
        name,
        { identifier: u.identifier, password: u.password },
      ]),
    ),
  );
  persist();
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
      const service = true;
      await owner.query(
        "INSERT INTO sigeh.usuario_roles(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '2 days',CASE WHEN $7 THEN clock_timestamp()-interval '1 day' ELSE $8::timestamptz END)",
        [
          id,
          u.id,
          name === "none"
            ? ids.noneRole
            : name === "personal"
              ? ids.personalRole
              : ids.role,
          name === "other" ? ids.hb : ids.ha,
          service ? (name === "other" ? ids.db : ids.da) : null,
          service ? (name === "other" ? ids.sb : ids.sa) : null,
          name === "expired",
          m.expiresAt,
        ],
      );
      ids["assignment_" + name] = id;
      await owner.query(
        "INSERT INTO sigeh.usuario_roles_contexto(usuario_rol_id,tipo,mandato_desde,mandato_hasta) VALUES($1,$2,clock_timestamp()-interval '2 days',$3::timestamptz)",
        [id, name === "encargo" ? "ENCARGADO" : "TITULAR", m.expiresAt],
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
  m.state = "PREPARED";
  persist();
  return { users, ids };
}
