import {
  ApiProperty,
  ApiPropertyOptional,
  ApiHideProperty,
} from '@nestjs/swagger';
import { OrganizationQueryDto } from './organization-query.dto.js';

export class OrganizationReferenceQueryDto extends OrganizationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  override hospitalId?: string = undefined;
  @ApiPropertyOptional({ format: 'uuid' })
  override divisionId?: string = undefined;
  @ApiPropertyOptional({ format: 'uuid' })
  override servicioId?: string = undefined;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID exclusivo, orden ascendente',
  })
  override cursor?: string = undefined;
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  override limit = 50;
}

// Swagger-specific views inherit exactly the existing runtime validators/defaults.
// Hidden fields still reach the original parser, which rejects disallowed filters.
export class HospitalReferenceQueryDto extends OrganizationReferenceQueryDto {
  @ApiHideProperty() override divisionId?: string = undefined;
  @ApiHideProperty() override servicioId?: string = undefined;
}
export class DivisionReferenceQueryDto extends OrganizationReferenceQueryDto {
  @ApiHideProperty() override servicioId?: string = undefined;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Redundante: si se envía, debe coincidir con hospitalId de ruta',
  })
  override hospitalId?: string = undefined;
}
export class ServiceReferenceQueryDto extends OrganizationReferenceQueryDto {
  // Required by parseOrganizationQuery, not by a new ValidationPipe constraint.
  @ApiProperty({ format: 'uuid', required: true })
  override hospitalId?: string = undefined;
}

export class OrganizationReferenceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) divisionId!:
    string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) servicioId!:
    string | null;
  @ApiProperty() activo!: boolean;
}

export class OrganizationReferencePageDto {
  @ApiProperty({ type: [OrganizationReferenceDto] })
  items!: OrganizationReferenceDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!:
    string | null;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ enum: ['id:asc'] }) order!: 'id:asc';
}
