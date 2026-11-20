// Fixed deletion inventory. Never accepts SQL identifiers from a manifest/operator.
import { check } from "./qa-demo-core.mjs";
export const TABLE_KEYS = Object.freeze({
  auditoria_seguridad: "evento_id",
  refresh_tokens_sesion: "token_id",
  sesiones_usuario: "sesion_id",
  iam_limites_acceso: "clave_hash",
  programacion_laboral: "programacion_id",
  adscripciones: "adscripcion_id",
  contratos: "contrato_id",
  empleados: "empleado_id",
  horarios: "horario_id",
  categorias: "categoria_id",
  encargo_permisos: "usuario_rol_id",
  usuario_roles_contexto: "usuario_rol_id",
  usuario_roles: "usuario_rol_id",
  usuario_credenciales: "usuario_id",
  usuarios: "usuario_id",
  rol_permisos: "rol_id",
  roles: "rol_id",
  servicios: "servicio_id",
  divisiones: "division_id",
  hospitales: "hospital_id",
});
export function assertOwned(rows, xids) {
  const known = new Set(xids);
  check(
    rows.every((row) => known.has(row.xid)),
    "FOREIGN_FIXTURE_WRITER",
  );
}
export async function deleteOwned(admin, table, key, ids, xids) {
  check(
    Object.hasOwn(TABLE_KEYS, table) && TABLE_KEYS[table] === key,
    "DELETE_IDENTIFIER_REJECTED",
  );
  check(
    Array.isArray(ids) &&
      ids.length <= 10000 &&
      Array.isArray(xids) &&
      xids.length > 0,
    "DELETE_REGISTRY_REJECTED",
  );
  const type = table === "iam_limites_acceso" ? "text" : "uuid";
  const found = await admin.query(
    `SELECT xmin::text AS xid FROM sigeh.${table} WHERE ${key}::${type}=ANY($1::${type}[]) FOR UPDATE`,
    [ids],
  );
  assertOwned(found.rows, xids);
  return admin.query(
    `DELETE FROM sigeh.${table} WHERE ${key}::${type}=ANY($1::${type}[]) AND xmin::text=ANY($2::text[])`,
    [ids, xids],
  );
}

export function fixtureIds(m, table) {
  const derived = {
    usuario_credenciales: "usuarios",
    usuario_roles_contexto: "usuario_roles",
    encargo_permisos: "usuario_roles",
    rol_permisos: "roles",
  };
  return m.created[derived[table] ?? table] ?? [];
}
export function cleanupPlan(m, api) {
  const order = [
    "usuario_credenciales",
    "encargo_permisos",
    "usuario_roles_contexto",
    "usuario_roles",
    "usuarios",
    "rol_permisos",
    "roles",
    "programacion_laboral",
    "adscripciones",
    "contratos",
    "empleados",
    "horarios",
    "categorias",
    "servicios",
    "divisiones",
    "hospitales",
  ];
  return [
    ...api,
    ...order.map((table) => [table, TABLE_KEYS[table], fixtureIds(m, table)]),
  ];
}
