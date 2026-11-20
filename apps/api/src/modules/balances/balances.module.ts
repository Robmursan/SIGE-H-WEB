import { Module } from '@nestjs/common';
import { LecturasModule } from '../lecturas/lecturas.module.js';
import { DashboardController } from './dashboard.controller.js';
@Module({ imports: [LecturasModule], controllers: [DashboardController] })
export class BalancesModule {}
