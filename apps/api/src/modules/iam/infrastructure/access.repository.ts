import { Injectable } from '@nestjs/common';
import { type QueryResultRow } from 'pg';
import { PostgresService } from '../../../database/postgres.service.js';
import { type PersistedAssignment } from '../domain/access-policy.js';

interface AssignmentRow extends QueryResultRow {
  usuario_activo: boolean;
  hospital_activo: boolean;
  hospital_id: string;
  division_id: string | null;
  servicio_id: string | null;
  division_real_id: string | null;
  division_hospital_id: string | null;
  division_activo: boolean | null;
  servicio_real_id: string | null;
  servicio_hospital_id: string | null;
  servicio_division_id: string | null;
  servicio_activo: boolean | null;
  vigente_desde: Date;
  vigente_hasta: Date | null;
  observed_at: Date;
  permisos: string[];
}

@Injectable()
export class AccessRepository {
  constructor(private readonly postgres: PostgresService) {}

  async assignments(usuarioId: string): Promise<PersistedAssignment[]> {
    const result = await this.postgres.query<AssignmentRow>(
      `
      SELECT u.activo AS usuario_activo, h.activo AS hospital_activo,
        ur.hospital_id, ur.division_id, ur.servicio_id,
        d.division_id AS division_real_id, d.hospital_id AS division_hospital_id,
        d.activo AS division_activo, s.servicio_id AS servicio_real_id,
        s.hospital_id AS servicio_hospital_id, s.division_id AS servicio_division_id,
        s.activo AS servicio_activo, ur.vigente_desde, ur.vigente_hasta,
        CURRENT_TIMESTAMP AS observed_at,
        ARRAY(SELECT p.codigo FROM sigeh.rol_permisos rp
          JOIN sigeh.permisos p ON p.permiso_id = rp.permiso_id
          WHERE rp.rol_id = ur.rol_id ORDER BY p.codigo) AS permisos
      FROM sigeh.usuarios u
      JOIN sigeh.usuario_roles ur ON ur.usuario_id = u.usuario_id
      JOIN sigeh.roles r ON r.rol_id = ur.rol_id
      JOIN sigeh.hospitales h ON h.hospital_id = ur.hospital_id
      LEFT JOIN sigeh.servicios s ON s.servicio_id = ur.servicio_id
      LEFT JOIN sigeh.divisiones d ON d.division_id = COALESCE(ur.division_id, s.division_id)
      WHERE u.usuario_id = $1::uuid`,
      [usuarioId],
    );
    return result.rows.map((row) => ({
      usuarioActivo: row.usuario_activo,
      hospitalActivo: row.hospital_activo,
      scope: {
        hospitalId: row.hospital_id,
        divisionId: row.division_id,
        servicioId: row.servicio_id,
      },
      division:
        row.division_real_id === null
          ? null
          : {
              id: row.division_real_id,
              hospitalId: row.division_hospital_id!,
              activo: row.division_activo === true,
            },
      servicio:
        row.servicio_real_id === null
          ? null
          : {
              id: row.servicio_real_id,
              hospitalId: row.servicio_hospital_id!,
              divisionId: row.servicio_division_id!,
              activo: row.servicio_activo === true,
            },
      vigenteDesde: row.vigente_desde,
      vigenteHasta: row.vigente_hasta,
      observedAt: row.observed_at,
      permissions: row.permisos,
    }));
  }
}
