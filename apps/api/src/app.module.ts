import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { OperacionesModule } from './modules/operaciones/operaciones.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Explicit process configuration only; never import a legacy admin .env.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    IamModule,
    OrganizacionModule,
    PersonalModule,
    ProgramacionModule,
    AsistenciaModule,
    CoberturaModule,
    BalancesModule,
    OperacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
