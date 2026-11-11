import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service.js';
import {
  HealthErrorResponseDto,
  HealthResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly postgresService: PostgresService) {}

  async checkHealth(): Promise<HealthResponseDto> {
    const timestamp = new Date().toISOString();
    const schema = this.postgresService.getSchema();

    try {
      const ping = await this.postgresService.ping();

      if (!ping.ok) {
        throw new Error('Resultado inesperado en SELECT 1');
      }

      return {
        status: 'ok',
        service: 'sige-h-api',
        database: {
          status: 'up',
          schema: ping.schema,
          latencyMs: ping.latencyMs,
        },
        timestamp,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Verificación de salud PostgreSQL fallida en esquema '${schema}': ${reason}`,
      );

      const errorPayload: HealthErrorResponseDto = {
        status: 'error',
        service: 'sige-h-api',
        database: {
          status: 'down',
          schema,
        },
        message: 'Base de datos PostgreSQL no disponible',
        timestamp,
      };

      throw new ServiceUnavailableException(errorPayload);
    }
  }
}
