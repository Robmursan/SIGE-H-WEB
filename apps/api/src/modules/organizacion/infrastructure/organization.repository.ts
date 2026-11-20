import { Injectable } from '@nestjs/common';
import { type QueryResultRow } from 'pg';
import { PostgresService } from '../../../database/postgres.service.js';
import { ORGANIZATION_CATALOG_PERMISSION } from '../../iam/domain/access-policy.js';
import { AUTHORIZED_SCOPES_CTE } from '../../iam/infrastructure/authorization-sql.js';
import { type OrganizationItemDto } from '../dto/organization-item.dto.js';
import {
  type OrganizationCatalog,
  type OrganizationQueryDto,
} from '../dto/organization-query.dto.js';
import { type OrganizationReferencePageDto } from '../dto/organization-reference.dto.js';

// Fixed SQL only; neither table names nor expressions are supplied by a client.
const CATALOG_SQL: Record<OrganizationCatalog, string> = {
  hospitales: `SELECT h.hospital_id AS id, h.clave, h.nombre, h.hospital_id,
    NULL::uuid AS division_id, NULL::uuid AS servicio_id, h.zona_horaria
    FROM sigeh.hospitales h WHERE h.activo
    AND ($3::uuid IS NULL OR h.hospital_id = $3)
    AND $4::uuid IS NULL AND $5::uuid IS NULL
    AND ($6::uuid IS NULL OR h.hospital_id > $6)
    AND EXISTS (SELECT 1 FROM authorized_scopes a WHERE a.hospital_id = h.hospital_id)
    ORDER BY h.hospital_id LIMIT $7`,
  divisiones: `SELECT d.division_id AS id, d.clave, d.nombre, d.hospital_id,
    d.division_id, NULL::uuid AS servicio_id, NULL::text AS zona_horaria
    FROM sigeh.divisiones d JOIN sigeh.hospitales h ON h.hospital_id = d.hospital_id AND h.activo
    WHERE d.activo AND d.hospital_id = $3
    AND $5::uuid IS NULL
    AND ($4::uuid IS NULL OR d.division_id = $4)
    AND ($6::uuid IS NULL OR d.division_id > $6)
    AND EXISTS (SELECT 1 FROM authorized_scopes a WHERE a.hospital_id = d.hospital_id
      AND (a.division_id IS NULL OR a.division_id = d.division_id))
    ORDER BY d.division_id LIMIT $7`,
  servicios: `SELECT s.servicio_id AS id, s.clave, s.nombre, s.hospital_id,
    s.division_id, s.servicio_id, NULL::text AS zona_horaria
    FROM sigeh.servicios s JOIN sigeh.hospitales h ON h.hospital_id = s.hospital_id AND h.activo
    JOIN sigeh.divisiones d ON d.division_id = s.division_id AND d.hospital_id = s.hospital_id AND d.activo
    WHERE s.activo AND s.hospital_id = $3
    AND ($4::uuid IS NULL OR s.division_id = $4) AND ($5::uuid IS NULL OR s.servicio_id = $5)
    AND ($6::uuid IS NULL OR s.servicio_id > $6)
    AND EXISTS (SELECT 1 FROM authorized_scopes a WHERE a.hospital_id = s.hospital_id
      AND (a.division_id IS NULL OR a.division_id = s.division_id)
      AND (a.servicio_id IS NULL OR a.servicio_id = s.servicio_id))
    ORDER BY s.servicio_id LIMIT $7`,
  subareas: `SELECT sa.subarea_id AS id, sa.clave, sa.nombre, sa.hospital_id,
    s.division_id, sa.servicio_id, NULL::text AS zona_horaria
    FROM sigeh.subareas sa JOIN sigeh.servicios s ON s.servicio_id = sa.servicio_id
      AND s.hospital_id = sa.hospital_id AND s.activo
    JOIN sigeh.divisiones d ON d.division_id = s.division_id AND d.hospital_id = s.hospital_id AND d.activo
    JOIN sigeh.hospitales h ON h.hospital_id = sa.hospital_id AND h.activo
    WHERE sa.activo AND sa.hospital_id = $3 AND sa.servicio_id = $5
    AND ($4::uuid IS NULL OR s.division_id = $4) AND ($6::uuid IS NULL OR sa.subarea_id > $6)
    AND EXISTS (SELECT 1 FROM authorized_scopes a WHERE a.hospital_id = sa.hospital_id
      AND (a.division_id IS NULL OR a.division_id = s.division_id)
      AND (a.servicio_id IS NULL OR a.servicio_id = sa.servicio_id))
    ORDER BY sa.subarea_id LIMIT $7`,
};

interface ItemRow extends QueryResultRow {
  id: string;
  clave: string;
  nombre: string;
  hospital_id: string;
  division_id: string | null;
  servicio_id: string | null;
  zona_horaria: string | null;
}

@Injectable()
export class OrganizationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async references(
    usuarioId: string,
    catalog: Exclude<OrganizationCatalog, 'subareas'>,
    query: OrganizationQueryDto,
  ): Promise<OrganizationReferencePageDto> {
    const projections = {
      hospitales:
        'h.hospital_id AS id,h.hospital_id,NULL::uuid AS division_id,NULL::uuid AS servicio_id,h.activo',
      divisiones:
        'd.division_id AS id,d.hospital_id,d.division_id,NULL::uuid AS servicio_id,d.activo',
      servicios:
        's.servicio_id AS id,s.hospital_id,s.division_id,s.servicio_id,s.activo',
    };
    // Reuse the exact scoped catalog predicates; replace only a fixed SELECT projection.
    const text = CATALOG_SQL[catalog].replace(
      /^SELECT[\s\S]+?\n\s*FROM/,
      `SELECT ${projections[catalog]}\n FROM`,
    );
    const result = await this.postgres.query<ItemRow & { activo: boolean }>(
      `${AUTHORIZED_SCOPES_CTE}\n${text}`,
      [
        usuarioId,
        ORGANIZATION_CATALOG_PERMISSION,
        query.hospitalId ?? null,
        query.divisionId ?? null,
        query.servicioId ?? null,
        query.cursor ?? null,
        query.limit + 1,
      ],
    );
    const more = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        hospitalId: row.hospital_id,
        divisionId: row.division_id,
        servicioId: row.servicio_id,
        activo: row.activo,
      })),
      nextCursor: more ? rows.at(-1)!.id : null,
      limit: query.limit,
      order: 'id:asc',
    };
  }

  async list(
    usuarioId: string,
    catalog: OrganizationCatalog,
    query: OrganizationQueryDto,
  ): Promise<OrganizationItemDto[]> {
    const statement = CATALOG_SQL[catalog];
    if (!statement) throw new Error('CATALOGO_ORG_INVALIDO');
    const result = await this.postgres.query<ItemRow>(
      `${AUTHORIZED_SCOPES_CTE}\n${statement}`,
      [
        usuarioId,
        ORGANIZATION_CATALOG_PERMISSION,
        query.hospitalId ?? null,
        query.divisionId ?? null,
        query.servicioId ?? null,
        query.cursor ?? null,
        query.limit,
      ],
    );
    return result.rows.map((row) => ({
      id: row.id,
      clave: row.clave,
      nombre: row.nombre,
      hospitalId: row.hospital_id,
      divisionId: row.division_id,
      servicioId: row.servicio_id,
      zonaHoraria: row.zona_horaria,
    }));
  }
}
