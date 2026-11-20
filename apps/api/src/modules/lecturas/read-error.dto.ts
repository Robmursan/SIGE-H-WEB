import { ApiProperty } from '@nestjs/swagger';

// Documentation only: Nest's exception handler produces these bodies, not this DTO.
export class ReadHttpErrorDto {
  @ApiProperty({ type: 'integer', description: 'Código HTTP de la respuesta' })
  statusCode!: number;

  @ApiProperty({
    description:
      'Texto de la excepción o lista de errores de ValidationPipe; no es HTML',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({
    description: 'Etiqueta HTTP de Nest, por ejemplo Unauthorized o Not Found',
  })
  error!: string;
}
