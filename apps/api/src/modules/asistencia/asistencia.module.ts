import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { AsistenciaController } from './asistencia.controller.js';
import { AsistenciaRepository } from './asistencia.repository.js';
import {
  AsistenciaService,
  AttendanceAvailabilityGuard,
} from './asistencia.service.js';
@Module({
  imports: [IamModule],
  controllers: [AsistenciaController],
  providers: [
    AsistenciaRepository,
    AsistenciaService,
    AttendanceAvailabilityGuard,
  ],
})
export class AsistenciaModule {}
