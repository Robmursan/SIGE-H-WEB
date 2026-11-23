import {
  BadRequestException,
  ConflictException,
  Injectable,
  HttpException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type PoolClient } from 'pg';
import { PostgresService } from '../../database/postgres.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import {
  requireTransactionScope,
  type TargetScope,
} from '../preparacion/scoped-transaction.js';
import {
  type AdminOrganizationItem,
  type AdminPageQuery,
  type UpdateOrganizationDto,
} from './organization-admin.dto.js';

export type OrganizationEntity = 'divisiones' | 'servicios' | 'subareas';
const entities = {
  divisiones: { key: 'division_id', parent: 'hospital_id' },
  servicios: { key: 'servicio_id', parent: 'division_id' },
  subareas: { key: 'subarea_id', parent: 'servicio_id' },
} as const;
export function organizationRevision(
  row: Omit<AdminOrganizationItem, 'revision'>,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.id,
        row.hospitalId,
        row.divisionId ?? null,
        row.servicioId ?? null,
        row.clave,
        row.nombre,
        row.activo,
      ]),
    )
    .digest('hex');
}
function columns(entity: OrganizationEntity) {
  return `${entities[entity].key} AS id,hospital_id AS "hospitalId",clave,nombre,activo${entity === 'servicios' ? ',division_id AS "divisionId"' : entity === 'subareas' ? ',servicio_id AS "servicioId"' : ''}`;
}
function item(
  row: Omit<AdminOrganizationItem, 'revision'>,
): AdminOrganizationItem {
  return { ...row, revision: organizationRevision(row) };
}
@Injectable()
export class OrganizationAdminRepository {
  constructor(private readonly postgres: PostgresService) {}
  private async run<T>(
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
    concealForbidden = false,
  ): Promise<T> {
    try {
      return await this.postgres.withTransaction(
        async (client) => {
          if (!write)
            await client.query(
              'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
            );
          return work(client);
        },
        { readOnly: !write },
      );
    } catch (error) {
      if (concealForbidden && error instanceof ForbiddenException)
        throw new NotFoundException('Recurso no disponible');
      const code = (error as { code?: string }).code;
      if (code === '23505')
        throw new ConflictException('Código organizacional duplicado');
      if (['23503', '23514', '40001', '40P01', '55P03'].includes(code ?? ''))
        throw new ConflictException(
          'Relación o estado organizacional incompatible',
        );
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Administración no disponible');
    }
  }
  private async scope(
    client: PoolClient,
    entity: OrganizationEntity,
    hospitalId: string,
    parent?: string,
  ): Promise<TargetScope> {
    if (entity === 'divisiones') return { hospitalId };
    if (entity === 'servicios') {
      const r = await client.query(
        'SELECT division_id FROM sigeh.divisiones WHERE division_id=$1::uuid AND hospital_id=$2::uuid AND activo FOR SHARE',
        [parent, hospitalId],
      );
      if (!r.rows.length) throw new NotFoundException('División no disponible');
      return { hospitalId, divisionId: parent };
    }
    const r = await client.query(
      'SELECT division_id FROM sigeh.servicios WHERE servicio_id=$1::uuid AND hospital_id=$2::uuid AND activo',
      [parent, hospitalId],
    );
    if (!r.rows.length) throw new NotFoundException('Servicio no disponible');
    return {
      hospitalId,
      divisionId: r.rows[0].division_id as string,
      servicioId: parent,
    };
  }
  async create(
    actor: Principal,
    entity: OrganizationEntity,
    input: {
      hospitalId: string;
      clave: string;
      nombre: string;
      divisionId?: string;
      servicioId?: string;
    },
  ): Promise<AdminOrganizationItem> {
    return this.run(true, async (client) => {
      await client.query("SET LOCAL lock_timeout='2s'");
      const parent =
        entity === 'servicios' ? input.divisionId : input.servicioId;
      const scope = await this.scope(client, entity, input.hospitalId, parent);
      await requireTransactionScope(
        client,
        actor,
        'CATALOGOS_ADMINISTRAR',
        scope,
        true,
      );
      const extra =
        entity === 'divisiones' ? '' : `,${entities[entity].parent}`;
      const values = [
        input.hospitalId,
        input.clave,
        input.nombre,
        ...(entity === 'divisiones' ? [] : [parent]),
      ];
      const r = await client.query<Omit<AdminOrganizationItem, 'revision'>>(
        `INSERT INTO sigeh.${entity}(hospital_id,clave,nombre${extra}) VALUES($1,$2,$3${extra ? ',$4' : ''}) RETURNING ${columns(entity)}`,
        values,
      );
      const result = item(r.rows[0]!);
      await this.audit(client, actor, entity, result, null);
      return result;
    });
  }
  async detail(
    actor: Principal,
    entity: OrganizationEntity,
    hospitalId: string,
    id: string,
  ): Promise<AdminOrganizationItem> {
    return this.run(
      false,
      async (client) => {
        const r = await client.query<Omit<AdminOrganizationItem, 'revision'>>(
          `SELECT ${columns(entity)} FROM sigeh.${entity} WHERE ${entities[entity].key}=$1::uuid AND hospital_id=$2::uuid`,
          [id, hospitalId],
        );
        if (!r.rows.length)
          throw new NotFoundException('Recurso no disponible');
        const row = r.rows[0]!;
        // No row locks in a read-only transaction.
        const scope: TargetScope = {
          hospitalId,
          divisionId: entity === 'divisiones' ? id : row.divisionId,
          servicioId: entity === 'servicios' ? id : row.servicioId,
        };
        if (entity === 'subareas') {
          const parent = await client.query(
            'SELECT division_id FROM sigeh.servicios WHERE servicio_id=$1::uuid AND hospital_id=$2::uuid',
            [row.servicioId, hospitalId],
          );
          scope.divisionId = parent.rows[0]?.division_id as string | undefined;
        }
        await requireTransactionScope(
          client,
          actor,
          'CATALOGOS_ADMINISTRAR',
          scope,
          true,
        );
        return item(row);
      },
      true,
    );
  }
  async update(
    actor: Principal,
    entity: OrganizationEntity,
    hospitalId: string,
    id: string,
    patch: UpdateOrganizationDto,
  ): Promise<AdminOrganizationItem> {
    if (patch.clave === undefined && patch.nombre === undefined)
      throw new BadRequestException('Actualización vacía');
    return this.run(
      true,
      async (client) => {
        await client.query("SET LOCAL lock_timeout='2s'");
        const r = await client.query<Omit<AdminOrganizationItem, 'revision'>>(
          `SELECT ${columns(entity)} FROM sigeh.${entity} WHERE ${entities[entity].key}=$1::uuid AND hospital_id=$2::uuid FOR UPDATE`,
          [id, hospitalId],
        );
        if (!r.rows.length)
          throw new NotFoundException('Recurso no disponible');
        const previous = item(r.rows[0]!);
        const scope = await this.scope(
          client,
          entity,
          hospitalId,
          previous.divisionId ?? previous.servicioId,
        );
        if (entity === 'divisiones') scope.divisionId = id;
        if (entity === 'servicios') scope.servicioId = id;
        await requireTransactionScope(
          client,
          actor,
          'CATALOGOS_ADMINISTRAR',
          scope,
          true,
        );
        if (previous.revision !== patch.revision)
          throw new ConflictException('Revisión obsoleta');
        const updated = await client.query<
          Omit<AdminOrganizationItem, 'revision'>
        >(
          `UPDATE sigeh.${entity} SET clave=COALESCE($3,clave),nombre=COALESCE($4,nombre) WHERE ${entities[entity].key}=$1::uuid AND hospital_id=$2::uuid RETURNING ${columns(entity)}`,
          [id, hospitalId, patch.clave ?? null, patch.nombre ?? null],
        );
        const result = item(updated.rows[0]!);
        await this.audit(client, actor, entity, result, previous);
        return result;
      },
      true,
    );
  }
  async subareas(
    actor: Principal,
    hospitalId: string,
    servicioId: string,
    query: AdminPageQuery,
  ) {
    return this.run(
      false,
      async (client) => {
        const scope = await this.scope(
          client,
          'subareas',
          hospitalId,
          servicioId,
        );
        await requireTransactionScope(
          client,
          actor,
          'CATALOGOS_ADMINISTRAR',
          scope,
          true,
        );
        const r = await client.query<Omit<AdminOrganizationItem, 'revision'>>(
          `SELECT ${columns('subareas')} FROM sigeh.subareas WHERE hospital_id=$1::uuid AND servicio_id=$2::uuid AND ($3::uuid IS NULL OR subarea_id>$3::uuid) ORDER BY subarea_id LIMIT $4`,
          [hospitalId, servicioId, query.cursor ?? null, query.limit + 1],
        );
        const items = r.rows.slice(0, query.limit).map(item);
        return {
          items,
          nextCursor: r.rows.length > query.limit ? items.at(-1)!.id : null,
          limit: query.limit,
        };
      },
      true,
    );
  }
  async tree(actor: Principal, hospitalId: string) {
    return this.run(false, async (client) => {
      await requireTransactionScope(
        client,
        actor,
        'CATALOGOS_ADMINISTRAR',
        { hospitalId },
        true,
      );
      const result = {
        divisiones: [] as AdminOrganizationItem[],
        servicios: [] as AdminOrganizationItem[],
        subareas: [] as AdminOrganizationItem[],
      };
      for (const entity of ['divisiones', 'servicios', 'subareas'] as const) {
        const rows = await client.query<
          Omit<AdminOrganizationItem, 'revision'>
        >(
          `SELECT ${columns(entity)} FROM sigeh.${entity} WHERE hospital_id=$1::uuid ORDER BY ${entities[entity].key} LIMIT 1001`,
          [hospitalId],
        );
        if (rows.rows.length > 1000)
          throw new ServiceUnavailableException(
            'Árbol supera límite; usar consultas paginadas',
          );
        result[entity] = rows.rows.map(item);
      }
      return result;
    });
  }
  private async audit(
    client: PoolClient,
    actor: Principal,
    entity: OrganizationEntity,
    next: AdminOrganizationItem,
    previous: AdminOrganizationItem | null,
  ) {
    await client.query(
      'INSERT INTO sigeh.auditoria_general(hospital_id,tabla,registro_id,accion,actor_id,anterior,nuevo) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
      [
        next.hospitalId,
        entity,
        next.id,
        previous ? 'UPDATE' : 'INSERT',
        actor.usuarioId,
        previous ? JSON.stringify(previous) : null,
        JSON.stringify(next),
      ],
    );
  }
}
