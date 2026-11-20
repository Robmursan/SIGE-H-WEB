import { randomUUID, randomBytes } from "node:crypto";
export async function fixtures(owner, hasher, manifest, save) {
  const uuid = () => randomUUID(),
    ids = {
      ha: uuid(),
      hb: uuid(),
      da: uuid(),
      db: uuid(),
      sa: uuid(),
      sa2: uuid(),
      sb: uuid(),
      cat: uuid(),
      captureRole: uuid(),
      readRole: uuid(),
    };
  const users = {},
    programs = {};
  const tag = "ASI-" + manifest.runId.slice(0, 8);
  for (const name of [
    "chief",
    "other",
    "coord",
    "none",
    "encargoNone",
    "encargoNoMandate",
    "encargoOK",
    "revoked",
  ])
    users[name] = {
      id: uuid(),
      identifier: tag + "." + name,
      password: randomBytes(24).toString("base64url"),
      assignment: uuid(),
    };
  for (const name of [
    "present",
    "absent",
    "partial",
    "raceSame",
    "raceDifferent",
    "foreignHospital",
    "foreignService",
    "encargo",
    "revoked",
    "rollback",
    "timeout",
    "cancelled",
    "outside",
    "legacy",
  ])
    programs[name] = {
      id: uuid(),
      employee: uuid(),
      contract: uuid(),
      hospital: name === "foreignHospital" ? ids.hb : ids.ha,
      service:
        name === "foreignHospital"
          ? ids.sb
          : name === "foreignService"
            ? ids.sa2
            : ids.sa,
    };
  manifest.fixtures = {
    ids,
    users: Object.fromEntries(
      Object.entries(users).map(([k, u]) => [
        k,
        { id: u.id, identifier: u.identifier, assignment: u.assignment },
      ]),
    ),
    programs,
  };
  save();
  let index = 0;
  const query = (sql, args) => {
    manifest.fixtureOperation = {
      index: ++index,
      table: /INTO sigeh\.([a-z_]+)/.exec(sql)?.[1] ?? "transaction",
    };
    save();
    return owner.query(sql, args);
  };
  const hashes = {};
  for (const [k, u] of Object.entries(users))
    hashes[k] = await hasher.hash(u.password);
  await query("BEGIN");
  try {
    for (const [id, k] of [
      [ids.ha, "A"],
      [ids.hb, "B"],
    ])
      await query(
        "INSERT INTO sigeh.hospitales(hospital_id,clave,nombre,zona_horaria) VALUES($1,$2,$3,'UTC')",
        [id, tag + k, tag + " HOSPITAL SINTETICO " + k],
      );
    for (const [id, h, k] of [
      [ids.da, ids.ha, "A"],
      [ids.db, ids.hb, "B"],
    ])
      await query(
        "INSERT INTO sigeh.divisiones(division_id,hospital_id,clave,nombre) VALUES($1,$2,$3::text,$3::text)",
        [id, h, tag + k],
      );
    for (const [id, h, d, k] of [
      [ids.sa, ids.ha, ids.da, "A1"],
      [ids.sa2, ids.ha, ids.da, "A2"],
      [ids.sb, ids.hb, ids.db, "B"],
    ])
      await query(
        "INSERT INTO sigeh.servicios(servicio_id,hospital_id,division_id,clave,nombre) VALUES($1,$2,$3,$4::text,$4::text)",
        [id, h, d, tag + k],
      );
    await query(
      "INSERT INTO sigeh.categorias(categoria_id,clave,nombre) VALUES($1,$2::text,$2::text)",
      [ids.cat, tag],
    );
    for (const [id, k] of [
      [ids.captureRole, "CAPTURE"],
      [ids.readRole, "READ"],
    ])
      await query(
        "INSERT INTO sigeh.roles(rol_id,codigo,nombre) VALUES($1,$2::text,$2::text)",
        [id, tag + k],
      );
    await query(
      "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) SELECT $1,permiso_id FROM sigeh.permisos WHERE codigo='ASISTENCIA_CAPTURAR'",
      [ids.captureRole],
    );
    await query(
      "INSERT INTO sigeh.rol_permisos(rol_id,permiso_id) SELECT $1,permiso_id FROM sigeh.permisos WHERE codigo='ASISTENCIA_VALIDAR'",
      [ids.readRole],
    );
    for (const [name, u] of Object.entries(users)) {
      await query(
        "INSERT INTO sigeh.usuarios(usuario_id,identificador) VALUES($1,$2)",
        [u.id, u.identifier],
      );
      await query(
        "INSERT INTO sigeh.usuario_credenciales(usuario_id,password_hash,requiere_cambio) VALUES($1,$2,false)",
        [u.id, hashes[name]],
      );
      if (name === "none") continue;
      const other = name === "other";
      await query(
        "INSERT INTO sigeh.usuario_roles(usuario_rol_id,usuario_id,rol_id,hospital_id,division_id,servicio_id,vigente_desde) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '1 day')",
        [
          u.assignment,
          u.id,
          name === "coord" ? ids.readRole : ids.captureRole,
          other ? ids.hb : ids.ha,
          other ? ids.db : ids.da,
          other ? ids.sb : ids.sa,
        ],
      );
      if (name !== "encargoNoMandate")
        await query(
          "INSERT INTO sigeh.usuario_roles_contexto(usuario_rol_id,tipo,mandato_desde,mandato_hasta) VALUES($1,$2,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')",
          [u.assignment, name.startsWith("encargo") ? "ENCARGADO" : "TITULAR"],
        );
      if (name === "encargoOK")
        await query(
          "INSERT INTO sigeh.encargo_permisos(usuario_rol_id,permiso_id) SELECT $1,permiso_id FROM sigeh.permisos WHERE codigo='ASISTENCIA_CAPTURAR'",
          [u.assignment],
        );
    }
    for (const [name, p] of Object.entries(programs)) {
      await query(
        "INSERT INTO sigeh.empleados(empleado_id,rud,nombres,primer_apellido) VALUES($1,$2,$3,'SINTETICO')",
        [p.employee, tag + "." + name, "PRUEBA " + name],
      );
      await query(
        "INSERT INTO sigeh.contratos(contrato_id,empleado_id,hospital_id,categoria_id,tipo,inicio,fin) VALUES($1,$2,$3,$4,'OTRO',CURRENT_DATE-2,CURRENT_DATE+2)",
        [p.contract, p.employee, p.hospital, ids.cat],
      );
      await query(
        "INSERT INTO sigeh.programacion_laboral(programacion_id,empleado_id,contrato_id,hospital_id,servicio_id,inicio_programado,fin_programado,origen,estado) VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '5 minutes',clock_timestamp()+ CASE WHEN $6 THEN interval '-1 minute' ELSE interval '30 minutes' END,'MANUAL',$7)",
        [
          p.id,
          p.employee,
          p.contract,
          p.hospital,
          p.service,
          name === "outside",
          name === "cancelled" ? "CANCELADA" : "PROGRAMADA",
        ],
      );
    }
    await query(
      "INSERT INTO sigeh.registros_asistencia(programacion_id) VALUES($1)",
      [programs.legacy.id],
    );
    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }
  return { ids, users, programs };
}
