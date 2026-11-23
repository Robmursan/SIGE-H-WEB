import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class AdminHospitalQuery {
  @ApiProperty({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  hospitalId!: string;
}
export class CreateDivisionDto extends AdminHospitalQuery {
  @ApiProperty({ maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(30)
  clave!: string;
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  nombre!: string;
}
export class CreateServiceDto extends CreateDivisionDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  divisionId!: string;
}
export class CreateSubareaDto extends CreateDivisionDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  servicioId!: string;
}
export class UpdateOrganizationDto {
  @ApiProperty({
    description: 'SHA-256 revision devuelta por el detalle',
    pattern: '^[a-f0-9]{64}$',
  })
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
  @ApiPropertyOptional({ maxLength: 30 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(30)
  clave?: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  nombre?: string;
}
export class AdminOrganizationItem {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) divisionId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) servicioId?: string;
  @ApiProperty() clave!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() activo!: boolean;
  @ApiProperty() revision!: string;
}

export class AdminPageQuery extends AdminHospitalQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({ type: 'integer', default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
export class AdminOrganizationPage {
  @ApiProperty({ type: [AdminOrganizationItem] })
  items!: AdminOrganizationItem[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) nextCursor!:
    string | null;
  @ApiProperty() limit!: number;
}
export class AdminOrganizationTree {
  @ApiProperty({ type: [AdminOrganizationItem] })
  divisiones!: AdminOrganizationItem[];
  @ApiProperty({ type: [AdminOrganizationItem] })
  servicios!: AdminOrganizationItem[];
  @ApiProperty({ type: [AdminOrganizationItem] })
  subareas!: AdminOrganizationItem[];
}
