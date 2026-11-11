import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { OrganizacionModule } from './modules/organizacion/organizacion.module.js';
import { PersonalModule } from './modules/personal/personal.module.js';
import { ProgramacionModule } from './modules/programacion/programacion.module.js';
import { AsistenciaModule } from './modules/asistencia/asistencia.module.js';
import { CoberturaModule } from './modules/cobertura/cobertura.module.js';
import { BalancesModule } from './modules/balances/balances.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    DatabaseModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: Number(config.get<number>('DB_PORT', 5432)),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        schema: config.get<string>('DB_SCHEMA', 'sigeh'),
        autoLoadEntities: true,
        synchronize: false,
        logging: ['error', 'warn'],
      }),
    }),
    HealthModule,
    IamModule,
    OrganizacionModule,
    PersonalModule,
    ProgramacionModule,
    AsistenciaModule,
    CoberturaModule,
    BalancesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
