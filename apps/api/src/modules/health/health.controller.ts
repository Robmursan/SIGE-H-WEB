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
  LivenessResponseDto,
} from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({
    operationId: 'getHealthLive',
    summary: 'Health básico de liveness de la API (CU-OPS-01)',
    description:
      'Verifica que el proceso de la API NestJS está activo y respondiendo peticiones HTTP sin depender de PostgreSQL.',
  })
  @ApiOkResponse({
    description: 'Proceso API activo',
    type: LivenessResponseDto,
  })
  getLiveness(): LivenessResponseDto {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @ApiOperation({
    operationId: 'getHealthReady',
    summary: 'Readiness de PostgreSQL y esquema sigeh (CU-OPS-02)',
    description:
      'Verifica conectividad con el pool de PostgreSQL (SELECT 1) y la existencia del esquema configurado antes de recibir tráfico operativo.',
  })
  @ApiOkResponse({
    description: 'API y esquema PostgreSQL listos para operar',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      'PostgreSQL inaccesible o esquema sigeh no disponible (respuesta sanitizada)',
    type: HealthErrorResponseDto,
  })
  async getReadiness(): Promise<HealthResponseDto> {
    return this.healthService.checkReadiness();
  }

  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary:
      'Verificar salud de la API y conexión a PostgreSQL (compatibilidad Sprint 0 / CU-OPS-02)',
    description:
      'Ejecuta la verificación de readiness contra el pool de PostgreSQL en el esquema configurado y retorna el estado operativo sin exponer credenciales.',
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
