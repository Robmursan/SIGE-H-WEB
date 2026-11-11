export interface OrganizationScope {
  hospitalId: string;
  divisionId: string | null;
  servicioId: string | null;
}

export interface PersistedAssignment {
  usuarioActivo: boolean;
  hospitalActivo: boolean;
  scope: OrganizationScope;
  division: { id: string; hospitalId: string; activo: boolean } | null;
  servicio: {
    id: string;
    hospitalId: string;
    divisionId: string;
    activo: boolean;
  } | null;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  observedAt: Date;
  permissions: string[];
}

// Existing V1 code, not a newly created or automatically granted permission.
export const ORGANIZATION_CATALOG_PERMISSION = 'CATALOGOS_ADMINISTRAR';

export function assignmentAllows(
  grant: PersistedAssignment,
  requested: Partial<OrganizationScope>,
  permission: string,
): boolean {
  const { scope, division, servicio } = grant;
  const now = grant.observedAt.getTime();
  const start = grant.vigenteDesde.getTime();
  const end = grant.vigenteHasta?.getTime();
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(start) ||
    (end !== undefined && (!Number.isFinite(end) || end <= start)) ||
    !grant.usuarioActivo ||
    !grant.hospitalActivo ||
    start > now ||
    (end !== undefined && end <= now) ||
    !grant.permissions.includes(permission)
  )
    return false;

  // Always validate persisted ancestry; V1 usuario_roles has simple FKs.
  if (
    scope.servicioId !== null &&
    (!servicio ||
      servicio.id !== scope.servicioId ||
      !servicio.activo ||
      servicio.hospitalId !== scope.hospitalId)
  )
    return false;
  const effectiveDivision = scope.divisionId ?? servicio?.divisionId ?? null;
  if (
    effectiveDivision !== null &&
    (!division ||
      division.id !== effectiveDivision ||
      !division.activo ||
      division.hospitalId !== scope.hospitalId)
  )
    return false;
  if (
    scope.divisionId !== null &&
    servicio &&
    servicio.divisionId !== scope.divisionId
  )
    return false;
  if (requested.hospitalId && requested.hospitalId !== scope.hospitalId)
    return false;
  if (
    requested.divisionId &&
    effectiveDivision &&
    requested.divisionId !== effectiveDivision
  )
    return false;
  if (
    requested.servicioId &&
    scope.servicioId &&
    requested.servicioId !== scope.servicioId
  )
    return false;
  return true;
}
