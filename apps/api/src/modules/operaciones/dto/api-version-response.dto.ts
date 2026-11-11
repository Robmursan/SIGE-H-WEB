import { ApiProperty } from '@nestjs/swagger';

export class ApiVersionResponseDto {
  @ApiProperty({
    example: '1.0.0',
    description: 'Versión del contrato API, igual a info.version de OpenAPI.',
  })
  apiVersion!: string;

  @ApiProperty({
    example: '/api/v1',
    description: 'Prefijo público de la API.',
  })
  apiBasePath!: string;
}
