import { ApiProperty } from '@nestjs/swagger';

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
    description: 'Latencia de ejecución de SELECT 1 en milisegundos',
    example: 2,
  })
  latencyMs!: number;
}

export class DatabaseHealthDownDto {
  @ApiProperty({
    description: 'Estado de conectividad con PostgreSQL cuando falla SELECT 1',
    example: 'down',
    enum: ['down'],
  })
  status!: 'down';

  @ApiProperty({
    description: 'Esquema configurado en PostgreSQL',
    example: 'sigeh',
  })
  schema!: string;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Estado general del servicio',
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
    description: 'Diagnóstico de conectividad con PostgreSQL',
    type: DatabaseHealthUpDto,
  })
  database!: DatabaseHealthUpDto;

  @ApiProperty({
    description: 'Marca temporal UTC de la verificación en formato ISO 8601',
    example: '2026-11-10T20:45:00.000Z',
  })
  timestamp!: string;
}

export class HealthErrorResponseDto {
  @ApiProperty({
    description: 'Estado general cuando hay degradación crítica',
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
    description: 'Mensaje público sanitizado sin exponer credenciales ni trazas internas',
    example: 'Base de datos PostgreSQL no disponible',
  })
  message!: string;

  @ApiProperty({
    description: 'Marca temporal UTC del fallo en formato ISO 8601',
    example: '2026-11-10T20:45:00.000Z',
  })
  timestamp!: string;
}
