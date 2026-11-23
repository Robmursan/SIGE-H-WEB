import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
export class CalendarSimulationDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  hospitalId!: string;
  @ApiProperty({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  servicioId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  divisionId?: string;
}
export class CalendarIssueDto {
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({
    description:
      'Código estable del conflicto o exclusión; no es ausencia administrativa',
  })
  code!: string;
}
export class CalendarCandidateDto {
  @ApiPropertyOptional({ format: 'uuid' }) subareaId?: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty({ format: 'uuid' }) serviceId!: string;
  @ApiProperty({ format: 'uuid' }) scheduleId!: string;
  @ApiProperty({ format: 'date-time' }) start!: string;
  @ApiProperty({ format: 'date-time' }) end!: string;
  @ApiProperty({ enum: ['PATRON'] }) origin!: 'PATRON';
}
export class CalendarExistingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({ format: 'uuid' }) serviceId!: string;
  @ApiProperty({ format: 'date-time' }) start!: string;
  @ApiProperty({ format: 'date-time' }) end!: string;
  @ApiProperty({ enum: ['PROGRAMADA', 'CANCELADA', 'SUSTITUIDA', 'CERRADA'] })
  state!: string;
}
export class CalendarSummaryDto {
  @ApiProperty() candidates!: number;
  @ApiProperty() exclusions!: number;
  @ApiProperty() conflicts!: number;
  @ApiProperty() existing!: number;
}
export class CalendarSimulationResponseDto {
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() zone!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty({ format: 'uuid' }) serviceId!: string;
  @ApiProperty({ type: [CalendarCandidateDto] })
  candidates!: CalendarCandidateDto[];
  @ApiProperty({ type: [CalendarIssueDto] }) exclusions!: CalendarIssueDto[];
  @ApiProperty({ type: [CalendarIssueDto] }) conflicts!: CalendarIssueDto[];
  @ApiProperty({ type: [CalendarExistingDto] })
  existing!: CalendarExistingDto[];
  @ApiProperty({ type: CalendarSummaryDto }) summary!: CalendarSummaryDto;
  @ApiProperty({
    description:
      'Aptitud lógica del snapshot, no autorización de publicación; publicación no implementada',
  })
  publishable!: boolean;
  @ApiProperty({ enum: [false] }) businessWrites!: false;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) fingerprint!: string;
}
