import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({
    description: 'Estado de vida (liveness) del proceso API (CU-OPS-01)',
    example: 'ok',
    enum: ['ok'],
  })
  status!: 'ok';

  @ApiProperty({
    description: 'Identificador lógico del servicio API',
    example: 'sige-h-api',
  })
  service!: string;

  @ApiProperty({
    description: 'Marca temporal UTC de la verificación en formato ISO 8601',
    example: '2026-11-10T22:00:00.000Z',
  })
  timestamp!: string;
}

export class DatabaseHealthUpDto {
  @ApiProperty({
    description: 'Estado de conectividad con PostgreSQL',
    example: 'up',
    enum: ['up'],
  })
  status!: 'up';

  @ApiProperty({
    description: 'Esquema configurado en PostgreSQL',
    example: 'sigeh',
  })
  schema!: string;

  @ApiProperty({
    description:
      'Indica si el esquema configurado fue verificado en information_schema.schemata',
    example: true,
  })
  schemaVerified!: boolean;

  @ApiProperty({
    description: 'Latencia de verificación SQL en milisegundos',
    example: 2,
  })
  latencyMs!: number;
}

export class DatabaseHealthDownDto {
  @ApiProperty({
    description:
      'Estado de conectividad o preparación de PostgreSQL cuando falla la sonda',
    example: 'down',
    enum: ['down'],
  })
  status!: 'down';

  @ApiProperty({
    description: 'Esquema configurado en PostgreSQL',
    example: 'sigeh',
  })
  schema!: string;

  @ApiProperty({
    description: 'Indica si el esquema pudo ser verificado antes del fallo',
    example: false,
  })
  schemaVerified!: boolean;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Estado general de preparación (readiness) del servicio',
    example: 'ok',
    enum: ['ok'],
  })
  status!: 'ok';

  @ApiProperty({
    description: 'Identificador lógico del servicio API',
    example: 'sige-h-api',
  })
  service!: string;

  @ApiProperty({
    description: 'Diagnóstico de conectividad y esquema en PostgreSQL',
    type: DatabaseHealthUpDto,
  })
  database!: DatabaseHealthUpDto;

  @ApiProperty({
    description: 'Marca temporal UTC de la verificación en formato ISO 8601',
    example: '2026-11-10T22:00:00.000Z',
  })
  timestamp!: string;
}

export class HealthErrorResponseDto {
  @ApiProperty({
    description: 'Estado general cuando hay degradación crítica o falta de preparación',
    example: 'error',
    enum: ['error'],
  })
  status!: 'error';

  @ApiProperty({
    description: 'Identificador lógico del servicio API',
    example: 'sige-h-api',
  })
  service!: string;

  @ApiProperty({
    description: 'Diagnóstico sanitizado de la base de datos',
    type: DatabaseHealthDownDto,
  })
  database!: DatabaseHealthDownDto;

  @ApiProperty({
    description:
      'Mensaje público sanitizado sin exponer credenciales ni trazas internas',
    example: 'Base de datos PostgreSQL no disponible',
  })
  message!: string;

  @ApiProperty({
    description: 'Marca temporal UTC del fallo en formato ISO 8601',
    example: '2026-11-10T22:00:00.000Z',
  })
  timestamp!: string;
}
