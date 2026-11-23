import { ForbiddenException } from '@nestjs/common';
import { type PoolClient } from 'pg';
import { AUTHORIZED_SCOPES_CTE } from '../iam/infrastructure/authorization-sql.js';
import { type Principal } from '../iam/domain/session-model.js';

export interface TargetScope {
  hospitalId: string;
  divisionId?: string | null;
  servicioId?: string | null;
}
// The original CTE remains unchanged. The additional predicate restricts admin
// operations to a TITULAR grant that itself carries the requested permission.
export const TITULAR_SCOPES_CTE = AUTHORIZED_SCOPES_CTE.replace(
  'WHERE ctx.mandato_desde',
  "WHERE ctx.tipo='TITULAR' AND ctx.mandato_desde",
);
export async function requireTransactionScope(
  client: PoolClient,
  actor: Principal,
  permission: string,
  scope: TargetScope,
  titularOnly = false,
): Promise<void> {
  const { rows } = await client.query(
    `${titularOnly ? TITULAR_SCOPES_CTE : AUTHORIZED_SCOPES_CTE}
    SELECT 1 FROM sigeh.hospitales h
    LEFT JOIN sigeh.divisiones d ON d.division_id=$4::uuid AND d.hospital_id=h.hospital_id AND d.activo
    LEFT JOIN sigeh.servicios s ON s.servicio_id=$5::uuid AND s.hospital_id=h.hospital_id AND s.activo
    LEFT JOIN sigeh.divisiones sd ON sd.division_id=s.division_id AND sd.hospital_id=h.hospital_id AND sd.activo
    WHERE h.hospital_id=$3::uuid AND h.activo
    AND ($4::uuid IS NULL OR d.division_id IS NOT NULL)
    AND ($5::uuid IS NULL OR (s.servicio_id IS NOT NULL AND sd.division_id IS NOT NULL
      AND ($4::uuid IS NULL OR s.division_id=$4::uuid)))
    AND EXISTS (SELECT 1 FROM authorized_scopes a WHERE a.hospital_id=h.hospital_id
      AND (a.division_id IS NULL OR a.division_id=COALESCE($4::uuid,s.division_id))
      AND (a.servicio_id IS NULL OR a.servicio_id=$5::uuid))
    AND EXISTS (SELECT 1 FROM sigeh.sesiones_usuario se WHERE se.sesion_id=$6::uuid
      AND se.usuario_id=$1::uuid AND se.revocada_en IS NULL
      AND se.expira_en>CURRENT_TIMESTAMP AND se.inactiva_en>CURRENT_TIMESTAMP)`,
    [
      actor.usuarioId,
      permission,
      scope.hospitalId,
      scope.divisionId ?? null,
      scope.servicioId ?? null,
      actor.sesionId,
    ],
  );
  if (!rows.length)
    throw new ForbiddenException('Facultad o ámbito insuficiente');
}
