import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IamModule } from './modules/iam/iam.module.js';
import { OrganizacionModule } from './modules/organizacion/organizacion.module.js';
import { PersonalModule } from './modules/personal/personal.module.js';
import { ProgramacionModule } from './modules/programacion/programacion.module.js';
import { AsistenciaModule } from './modules/asistencia/asistencia.module.js';
import { CoberturaModule } from './modules/cobertura/cobertura.module.js';
import { BalancesModule } from './modules/balances/balances.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
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
