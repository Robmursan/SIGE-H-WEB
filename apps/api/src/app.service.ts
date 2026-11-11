import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { PostgresService } from './database/postgres.service.js';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Optional() private readonly postgresService?: PostgresService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.postgresService) {
      return;
    }

    try {
      const schema = this.postgresService.getSchema();
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error conectando a PostgreSQL: ${message}`);
    }
  }

  getHello(): string {
    return 'SIGE-H API Online';
  }
}
