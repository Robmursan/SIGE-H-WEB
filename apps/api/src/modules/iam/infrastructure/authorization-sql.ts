// Same predicates used by the final resource query, so a revoked assignment is
// not accepted merely because it passed an earlier application check.
export const AUTHORIZED_SCOPES_CTE = `WITH authorized_scopes AS (
  SELECT DISTINCT ur.hospital_id,
    COALESCE(ur.division_id, s.division_id) AS division_id,
    ur.servicio_id
  FROM sigeh.usuarios u
  JOIN sigeh.usuario_roles ur ON ur.usuario_id = u.usuario_id
  JOIN sigeh.roles r ON r.rol_id = ur.rol_id
  JOIN sigeh.rol_permisos rp ON rp.rol_id = r.rol_id
  JOIN sigeh.permisos p ON p.permiso_id = rp.permiso_id
  JOIN sigeh.hospitales h ON h.hospital_id = ur.hospital_id AND h.activo
  LEFT JOIN sigeh.servicios s ON s.servicio_id = ur.servicio_id
    AND s.hospital_id = ur.hospital_id AND s.activo
  LEFT JOIN sigeh.divisiones d ON d.division_id = COALESCE(ur.division_id, s.division_id)
    AND d.hospital_id = ur.hospital_id AND d.activo
  WHERE u.usuario_id = $1::uuid AND u.activo AND p.codigo = $2
    AND ur.vigente_desde <= CURRENT_TIMESTAMP
    AND (ur.vigente_hasta IS NULL OR ur.vigente_hasta > CURRENT_TIMESTAMP)
    AND (ur.servicio_id IS NULL OR s.servicio_id IS NOT NULL)
    AND (COALESCE(ur.division_id, s.division_id) IS NULL OR d.division_id IS NOT NULL)
    AND (ur.division_id IS NULL OR ur.servicio_id IS NULL OR s.division_id = ur.division_id)
)`;
