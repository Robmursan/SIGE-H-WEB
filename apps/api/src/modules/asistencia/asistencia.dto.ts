import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';
export const CAPTURE_STATES = ['PRESENTE', 'AUSENTE', 'PARCIAL'] as const;
export type CaptureState = (typeof CAPTURE_STATES)[number];
export const OPERATIONAL_STATES = [
  'PENDIENTE',
  ...CAPTURE_STATES,
  'NO_EXIGIBLE',
];
export const REASONS = [
  'YA_REGISTRADA',
  'FUERA_VENTANA',
  'PROGRAMACION_NO_CAPTURABLE',
  'CONTRATO_NO_VIGENTE',
  'CIERRE_EXISTENTE',
  'SIN_FACULTAD_CAPTURA',
] as const;
export type Reason = (typeof REASONS)[number];
export class PaseListaQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() servicioId!: string;
  @ApiProperty({
    format: 'date',
    description: 'Fecha local de inicio de jornada, zona del hospital',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID()
  horarioId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, v) => v !== undefined)
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
export class CapturarAsistenciaDto {
  @ApiProperty({ enum: CAPTURE_STATES })
  @IsIn(CAPTURE_STATES)
  estado!: CaptureState;
  @ApiProperty({ enum: ['0'], description: 'Solo primera captura' })
  @Equals('0')
  expectedRevision!: '0';
}
export function strictDto<T extends object>(
  input: unknown,
  ctor: new () => T,
): T {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.values(input).some((v) => v === null || Array.isArray(v))
  )
    throw new BadRequestException('Entrada inválida');
  if (
    'limit' in input &&
    typeof input.limit === 'string' &&
    !/^[0-9]+$/.test(input.limit)
  )
    throw new BadRequestException('Límite inválido');
  const dto = plainToInstance(ctor, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    throw new BadRequestException('Entrada inválida');
  if ('fecha' in dto) {
    const day = String(dto.fecha),
      date = new Date(day + 'T00:00:00Z');
    if (
      !Number.isFinite(date.getTime()) ||
      Number(day.slice(0, 4)) < 1 ||
      date.toISOString().slice(0, 10) !== day
    )
      throw new BadRequestException('Fecha inválida');
  }
  return dto;
}
export class CaptureReceiptDto {
  @ApiProperty({ format: 'uuid' }) programacionId!: string;
  @ApiProperty({ format: 'uuid' }) asistenciaId!: string;
  @ApiProperty({
    pattern: '^[0-9]+$',
    description: 'BIGINT decimal, no convertir a Number',
  })
  eventoId!: string;
  @ApiProperty({ enum: CAPTURE_STATES }) estadoOperativo!: CaptureState;
  @ApiProperty({ enum: ['PENDIENTE'] }) validacionAdministrativa!: 'PENDIENTE';
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) registradoEn!: string;
  @ApiProperty({ pattern: '^[0-9]+$' }) revision!: string;
}
export class AttendanceEmployeeDto {
  @ApiProperty({ format: 'uuid' }) empleadoId!: string;
  @ApiProperty() nombres!: string;
  @ApiProperty() primerApellido!: string;
}
export class LastCaptureDto {
  @ApiProperty({ pattern: '^[0-9]+$' }) eventoId!: string;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) registradoEn!: string;
}
export class PaseListaItemDto {
  @ApiProperty({ format: 'uuid' }) programacionId!: string;
  @ApiProperty({ type: AttendanceEmployeeDto })
  empleado!: AttendanceEmployeeDto;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) horarioId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) turnoCodigo!: string | null;
  @ApiProperty({ format: 'date-time' }) inicioProgramado!: string;
  @ApiProperty({ format: 'date-time' }) finProgramado!: string;
  @ApiProperty({ enum: ['PROGRAMADA', 'CANCELADA', 'SUSTITUIDA', 'CERRADA'] })
  estadoProgramacion!: string;
  @ApiProperty() capturada!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) asistenciaId!:
    string | null;
  @ApiProperty({ enum: OPERATIONAL_STATES }) estadoOperativo!: string;
  @ApiProperty({
    type: String,
    enum: ['PENDIENTE', 'VALIDADA', 'OBSERVADA'],
    nullable: true,
  })
  validacionAdministrativa!: string | null;
  @ApiProperty({ pattern: '^[0-9]+$' }) revision!: string;
  @ApiProperty({ type: LastCaptureDto, nullable: true })
  ultimaCaptura!: LastCaptureDto | null;
  @ApiProperty() capturable!: boolean;
  @ApiProperty({ type: String, enum: REASONS, nullable: true })
  motivoNoCapturable!: Reason | null;
}
export class PaseListaPageDto {
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) servicioId!: string;
  @ApiProperty({ format: 'date' }) fecha!: string;
  @ApiProperty() zonaHoraria!: string;
  @ApiProperty({ type: [PaseListaItemDto] }) items!: PaseListaItemDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!:
    string | null;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) limit!: number;
  @ApiProperty({ enum: ['id:asc'] }) order!: 'id:asc';
}
