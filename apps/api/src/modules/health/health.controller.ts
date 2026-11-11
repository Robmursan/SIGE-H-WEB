import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthErrorResponseDto,
  HealthResponseDto,
} from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Verificar salud de la API y conexión a PostgreSQL (SELECT 1)',
    description:
      'Ejecuta SELECT 1 contra el pool de PostgreSQL en el esquema configurado y retorna el estado operativo sin exponer credenciales.',
  })
  @ApiOkResponse({
    description: 'API y base de datos PostgreSQL operativas',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Fallo de conectividad o indisponibilidad de PostgreSQL',
    type: HealthErrorResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    return this.healthService.checkHealth();
  }
}
