import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiVersionResponseDto } from './dto/api-version-response.dto.js';
import { GetApiVersionUseCase } from './get-api-version.use-case.js';

@ApiTags('Operaciones')
@Controller('meta')
export class OperacionesController {
  constructor(private readonly getApiVersion: GetApiVersionUseCase) {}

  @Get('version')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getApiContractVersion',
    summary: 'Consultar versión del contrato API (CU-OPS-03)',
    description:
      'Metadatos técnicos sin datos hospitalarios. No requiere sesión ni consulta PostgreSQL. No acredita readiness ni compatibilidad de clientes.',
  })
  @ApiOkResponse({ type: ApiVersionResponseDto })
  getVersion(): ApiVersionResponseDto {
    return this.getApiVersion.execute();
  }
}
