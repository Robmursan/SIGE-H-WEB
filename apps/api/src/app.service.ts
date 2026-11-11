import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PostgresService,
  sanitizeDbErrorMessage,
} from './database/postgres.service.js';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Optional() private readonly postgresService?: PostgresService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.postgresService) {
      return;
    }

    const nodeEnv =
      this.configService?.get<string>('NODE_ENV', 'development') ??
      'development';

    try {
      const schema = this.postgresService.getSchema();
      if (nodeEnv !== 'production') {
        const result = await this.postgresService.query<{ total: number }>(
          `SELECT count(*)::int AS total
           FROM information_schema.tables
           WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
          [schema],
        );
        const total = result.rows[0]?.total ?? 0;
        this.logger.log(
          `Conexión exitosa a PostgreSQL 17. Esquema '${schema}' detectado con ${total} tablas base.`,
        );
      } else {
        await this.postgresService.ping();
        this.logger.log(
          `Conexión exitosa a PostgreSQL 17 en esquema '${schema}'.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error conectando a PostgreSQL: ${sanitizeDbErrorMessage(error)}`,
      );
    }
  }

  getHello(): string {
    return 'SIGE-H API Online';
  }
}
