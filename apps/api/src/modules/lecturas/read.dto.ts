import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export class ReadScopeDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() servicioId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  divisionId?: string;
}
export class ReadPageDto extends ReadScopeDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID exclusivo del último item; orden ascendente',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
export class StaffReadQueryDto extends ReadPageDto {
  @ApiProperty({
    format: 'date',
    description:
      'Vigencia inclusiva a la fecha; no reconstruye estados contractuales históricos',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}
export class ReadWindowDto extends ReadScopeDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inicio inclusivo con zona/offset; ventana máxima 168 horas',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  desde!: string;
  @ApiProperty({
    format: 'date-time',
    description: 'Fin exclusivo con zona/offset',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  hasta!: string;
}
export class ScheduleReadQueryDto extends ReadWindowDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
export class EmployeeReadDto {
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty() nombres!: string;
  @ApiProperty() primerApellido!: string;
  @ApiProperty() activo!: boolean;
}
export class AssignmentReadDto {
  @ApiProperty({ format: 'uuid' }) adscripcionId!: string;
  @ApiProperty({ format: 'uuid' }) contratoId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ enum: ['NOMINAL', 'OPERATIVA'] }) clase!:
    'NOMINAL' | 'OPERATIVA';
  @ApiProperty({ format: 'date' }) inicio!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) fin!:
    string | null;
}
export class PageInfoDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!:
    string | null;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ enum: ['id:asc'] }) order!: 'id:asc';
}
export class EmployeePageDto extends PageInfoDto {
  @ApiProperty({ type: [EmployeeReadDto] }) items!: EmployeeReadDto[];
}
export class AssignmentPageDto extends PageInfoDto {
  @ApiProperty({ type: [AssignmentReadDto] }) items!: AssignmentReadDto[];
}
export class EmployeeDetailDto {
  @ApiProperty({ type: EmployeeReadDto }) empleado!: EmployeeReadDto;
  @ApiProperty({
    type: AssignmentPageDto,
    description:
      'Solo adscripciones vigentes y visibles del servicio solicitado; cursor sobre adscripcionId',
  })
  adscripciones!: AssignmentPageDto;
}
export class ScheduleReadDto {
  @ApiProperty({ format: 'uuid' }) programacionId!: string;
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) horarioId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) turnoCodigo!: string | null;
  @ApiProperty({ format: 'date-time' }) inicioProgramado!: string;
  @ApiProperty({ format: 'date-time' }) finProgramado!: string;
  @ApiProperty({ enum: ['PROGRAMADA', 'CANCELADA', 'SUSTITUIDA', 'CERRADA'] })
  estado!: string;
}
export class SchedulePageDto extends PageInfoDto {
  @ApiProperty({ type: [ScheduleReadDto] }) items!: ScheduleReadDto[];
}
export class ProgrammingDashboardDto {
  @ApiProperty({ enum: ['PROGRAMACION_NO_ASISTENCIA_NI_COBERTURA'] })
  base!: 'PROGRAMACION_NO_ASISTENCIA_NI_COBERTURA';
  @ApiProperty({ type: 'integer' }) jornadas!: number;
  @ApiProperty({ type: 'integer' }) empleadosProgramados!: number;
  @ApiProperty({ type: 'integer' }) programadas!: number;
  @ApiProperty({ type: 'integer' }) canceladas!: number;
  @ApiProperty({ type: 'integer' }) sustituidas!: number;
  @ApiProperty({ type: 'integer' }) cerradas!: number;
  @ApiProperty({
    description:
      'Horas-persona PROGRAMADA/CERRADA recortadas a la ventana, no horas de cobertura efectiva',
  })
  horasPersonaProgramadas!: number;
}
export function validateReadQuery<T extends ReadScopeDto>(
  input: T,
  ctor: new () => T,
): T {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.values(input).some((v) => v === null)
  )
    throw new BadRequestException('Consulta de lectura inválida');
  const query = plainToInstance(ctor, input);
  if (
    validateSync(query, { whitelist: true, forbidNonWhitelisted: true }).length
  )
    throw new BadRequestException('Consulta de lectura inválida');
  if ('fecha' in query) {
    const day = String(query.fecha);
    const d = new Date(day + 'T00:00:00Z');
    if (
      !Number.isFinite(d.getTime()) ||
      Number(day.slice(0, 4)) < 1 ||
      d.toISOString().slice(0, 10) !== day
    )
      throw new BadRequestException('Fecha inválida');
  }
  if ('desde' in query && 'hasta' in query) {
    const start = Date.parse(String(query.desde)),
      end = Date.parse(String(query.hasta));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 7 * 86400000
    )
      throw new BadRequestException('Intervalo inválido: máximo 168 horas');
  }
  return query;
}
