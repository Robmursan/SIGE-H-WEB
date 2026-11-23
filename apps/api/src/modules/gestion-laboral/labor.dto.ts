import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;
export class LaborScopeDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  hospitalId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(lower)
  @IsUUID()
  divisionId?: string;
  servicioId?: string;
}
export class LaborPageDto extends LaborScopeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(lower)
  @IsUUID()
  declare servicioId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(lower)
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({
    type: 'integer',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
export class EligibleQueryDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  hospitalId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(lower)
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({
    type: 'integer',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}
export class LaborDateQuery extends LaborPageDto {
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}
export class LaborConfigurationQuery extends LaborScopeDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  declare servicioId: string;
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}
export class LaborConfigurationPatternDto {
  @ApiProperty({ format: 'uuid' }) empleadoPatronId!: string;
  @ApiProperty({ format: 'uuid' }) patronId!: string;
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) fin!:
    string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  autorizadoPor!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      required: ['diaIso', 'tipoDia'],
      properties: {
        diaIso: { type: 'integer', minimum: 1, maximum: 7 },
        tipoDia: {
          type: 'string',
          enum: ['TRABAJO', 'DESCANSO', 'NO_PROGRAMADO'],
        },
      },
    },
  })
  dias!: { diaIso: number; tipoDia: string }[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) horarioId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) horaInicio!: string | null;
  @ApiProperty({ type: String, nullable: true }) horaFin!: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) cruzaMedianoche!:
    boolean | null;
}
export class LaborConfigurationDto {
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ format: 'date' }) fecha!: string;
  @ApiProperty({ type: [LaborConfigurationPatternDto] })
  patrones!: LaborConfigurationPatternDto[];
  @ApiProperty({
    type: [String],
    description:
      'Bloqueos de configuración, no ausencias ni prueba de disponibilidad efectiva.',
  })
  conflictos!: string[];
}
export class LaborPeriodDto extends LaborScopeDto {
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  inicio!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) fin!: string;
}
export class CreateAdscriptionDto extends LaborPeriodDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  declare servicioId: string;
  @ApiProperty({ enum: ['NOMINAL', 'OPERATIVA'] })
  @IsIn(['NOMINAL', 'OPERATIVA'])
  clase!: 'NOMINAL' | 'OPERATIVA';
}
export class CreateRotationDto extends LaborPeriodDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  contratoId!: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  subareaId!: string;
}
export class CreateHoursDto extends LaborScopeDto {
  @ApiProperty({ maxLength: 35 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(35)
  codigo!: string;
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  nombre!: string;
  @ApiProperty({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  horaInicio!: string;
  @ApiProperty({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  horaFin!: string;
  @ApiProperty() @IsBoolean() cruzaMedianoche!: boolean;
}
export class PatternDayDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  diaIso!: number;
  @ApiProperty({ enum: ['TRABAJO', 'DESCANSO', 'NO_PROGRAMADO'] })
  @IsIn(['TRABAJO', 'DESCANSO', 'NO_PROGRAMADO'])
  tipoDia!: 'TRABAJO' | 'DESCANSO' | 'NO_PROGRAMADO';
}
export class CreatePatternDto extends LaborScopeDto {
  @ApiProperty({ maxLength: 35 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(35)
  codigo!: string;
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  nombre!: string;
  @ApiProperty({
    enum: ['ORDINARIO', 'GUARDIA_NOCTURNA', 'JORNADA_ACUMULADA', 'ESPECIAL'],
  })
  @IsIn(['ORDINARIO', 'GUARDIA_NOCTURNA', 'JORNADA_ACUMULADA', 'ESPECIAL'])
  clase!: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  horarioId!: string;
  @ApiProperty({ type: [PatternDayDto], minItems: 7, maxItems: 7 })
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => PatternDayDto)
  dias!: PatternDayDto[];
}
export class AssignPatternDto extends LaborPeriodDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  patronId!: string;
}
export class CreateLaborIncidentDto extends LaborScopeDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  declare servicioId: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  contratoId!: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  tipoIncidenciaId!: string;
  @ApiProperty({
    format: 'date-time',
    description: 'Instante con Z u offset explícito; fin exclusivo',
  })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  inicio!: string;
  @ApiProperty({
    format: 'date-time',
    description: 'Fin exclusivo posterior al inicio',
  })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  fin!: string;
}
export class LaborIncidentHistoryQuery extends LaborScopeDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  declare servicioId: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(lower)
  @IsUUID()
  contratoId!: string;
  @ApiProperty({ enum: ['VACACIONES', 'INCAPACIDAD'] })
  @IsIn(['VACACIONES', 'INCAPACIDAD'])
  naturaleza!: 'VACACIONES' | 'INCAPACIDAD';
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  desde!: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  hasta!: string;
}
export class LaborIncidentQuery extends LaborIncidentHistoryQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(lower)
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({
    type: 'integer',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
export class EligibleEmployeeDto {
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: ['BASE', 'EVENTUAL', 'OTRO'] }) tipo!: string;
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) fin!:
    string | null;
}
export class AdscriptionDto {
  @ApiProperty({ format: 'uuid' }) adscripcionId!: string;
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ enum: ['NOMINAL', 'OPERATIVA'] }) clase!: string;
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ format: 'date' }) fin!: string;
}
export class RotationDto {
  @ApiProperty({ format: 'uuid' }) rotacionId!: string;
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty({ format: 'uuid' }) subareaId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ format: 'date' }) fin!: string;
}
export class HoursDto {
  @ApiProperty({ format: 'uuid' }) horarioId!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() horaInicio!: string;
  @ApiProperty() horaFin!: string;
  @ApiProperty() cruzaMedianoche!: boolean;
}
export class PatternDto {
  @ApiProperty({ format: 'uuid' }) patronId!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({
    enum: ['ORDINARIO', 'GUARDIA_NOCTURNA', 'JORNADA_ACUMULADA', 'ESPECIAL'],
  })
  clase!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) horarioId!:
    string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ type: [PatternDayDto] }) dias!: PatternDayDto[];
}
export class EmployeePatternDto {
  @ApiProperty({ format: 'uuid' }) empleadoPatronId!: string;
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty({ format: 'uuid' }) patronId!: string;
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ format: 'date' }) fin!: string;
  @ApiProperty({ format: 'uuid' }) autorizadoPor!: string;
}
export class LaborIncidentDto {
  @ApiProperty({ format: 'uuid' }) incidenciaId!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty({ format: 'uuid' }) tipoIncidenciaId!: string;
  @ApiProperty({ format: 'date-time' }) inicio!: string;
  @ApiProperty({ format: 'date-time' }) fin!: string;
  @ApiProperty({
    enum: ['CAPTURADA', 'EN_REVISION', 'AUTORIZADA', 'RECHAZADA', 'CANCELADA'],
  })
  estado!: string;
  @ApiProperty({ format: 'uuid' }) capturadoPor!: string;
  @ApiProperty({ format: 'date-time' }) creadoEn!: string;
}
export class IncidentVersionDto {
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) versionId!: string;
  @ApiProperty({ format: 'uuid' }) tipoIncidenciaId!: string;
  @ApiProperty() estado!: string;
  @ApiProperty({ format: 'date-time' }) inicio!: string;
  @ApiProperty({ format: 'date-time' }) fin!: string;
  @ApiProperty({ format: 'uuid' }) modificadoPor!: string;
  @ApiProperty({ format: 'date-time' }) registradoEn!: string;
}
class PageBase {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!:
    string | null;
  @ApiProperty({ type: 'integer' }) limit!: number;
}
export class EligiblePageDto extends PageBase {
  @ApiProperty({ type: [EligibleEmployeeDto] }) items!: EligibleEmployeeDto[];
}
export class RotationPageDto extends PageBase {
  @ApiProperty({ type: [RotationDto] }) items!: RotationDto[];
  @ApiProperty({
    type: 'integer',
    description:
      'Personas únicas solo de esta página; no dotación ni incorporación',
  })
  employeeCountOnPage!: number;
}
export class HoursPageDto extends PageBase {
  @ApiProperty({ type: [HoursDto] }) items!: HoursDto[];
}
export class PatternsPageDto extends PageBase {
  @ApiProperty({ type: [PatternDto] }) items!: PatternDto[];
}
export class IncidentsPageDto extends PageBase {
  @ApiProperty({ type: [LaborIncidentDto] }) items!: LaborIncidentDto[];
}
