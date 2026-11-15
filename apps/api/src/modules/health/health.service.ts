import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PostgresService,
  sanitizeDbErrorMessage,
} from '../../database/postgres.service.js';
import {
  HealthErrorResponseDto,
  HealthResponseDto,
  LivenessResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly postgresService: PostgresService) {}

  checkLiveness(): LivenessResponseDto {
    return {
      status: 'ok',
      service: 'sige-h-api',
      timestamp: new Date().toISOString(),
    };
  }

  async checkReadiness(): Promise<HealthResponseDto> {
    const timestamp = new Date().toISOString();
    const schema = this.postgresService.getSchema();

    try {
      const readiness = await this.postgresService.checkReadiness();

      if (!readiness.ok || !readiness.schemaVerified) {
        throw new Error(
          `Esquema '${schema}' no disponible o verificación SELECT 1 inválida`,
        );
      }

      return {
        status: 'ok',
        service: 'sige-h-api',
        database: {
          status: 'up',
          schema: readiness.schema,
          schemaVerified: readiness.schemaVerified,
          latencyMs: readiness.latencyMs,
        },
        timestamp,
      };
    } catch (error) {
      this.logger.warn(
        `Verificación de readiness PostgreSQL fallida en esquema '${schema}': ${sanitizeDbErrorMessage(error)}`,
      );

      const errorPayload: HealthErrorResponseDto = {
        status: 'error',
        service: 'sige-h-api',
        database: {
          status: 'down',
          schema,
          schemaVerified: false,
        },
        message: 'Base de datos PostgreSQL no disponible',
        timestamp,
      };

      throw new ServiceUnavailableException(errorPayload);
    }
  }

  async checkHealth(): Promise<HealthResponseDto> {
    return this.checkReadiness();
  }
}
