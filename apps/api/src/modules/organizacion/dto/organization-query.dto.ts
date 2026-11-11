import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export type OrganizationCatalog =
  'hospitales' | 'divisiones' | 'servicios' | 'subareas';

export class OrganizationQueryDto {
  @IsOptional() @IsUUID() hospitalId?: string;
  @IsOptional() @IsUUID() divisionId?: string;
  @IsOptional() @IsUUID() servicioId?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;
}

export function parseOrganizationQuery(
  input: unknown,
  catalog: OrganizationCatalog,
): OrganizationQueryDto {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('CONSULTA_ORG_INVALIDA');
  if (!['hospitales', 'divisiones', 'servicios', 'subareas'].includes(catalog))
    throw new Error('CATALOGO_ORG_INVALIDO');
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) =>
        !['hospitalId', 'divisionId', 'servicioId', 'cursor', 'limit'].includes(
          key,
        ),
    )
  ) {
    throw new Error('CONSULTA_ORG_INVALIDA');
  }
  for (const field of ['hospitalId', 'divisionId', 'servicioId', 'cursor']) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string')
      throw new Error('CONSULTA_ORG_INVALIDA');
  }
  if (raw.limit !== undefined) {
    const value = raw.limit;
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      !/^[1-9]\d*$/.test(String(value))
    )
      throw new Error('CONSULTA_ORG_INVALIDA');
  }
  const query = plainToInstance(OrganizationQueryDto, input);
  const errors = validateSync(query, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (
    errors.length ||
    (catalog !== 'hospitales' && !query.hospitalId) ||
    (catalog === 'subareas' && !query.servicioId) ||
    (catalog === 'hospitales' && (query.divisionId || query.servicioId)) ||
    (catalog === 'divisiones' && query.servicioId)
  )
    throw new Error('CONSULTA_ORG_INVALIDA');
  for (const field of [
    'hospitalId',
    'divisionId',
    'servicioId',
    'cursor',
  ] as const) {
    if (query[field]) query[field] = query[field].toLowerCase();
  }
  return query;
}
