import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import {
  LaborReadController,
  LaborWriteController,
  WorkforceReadGuard,
  WorkforceWriteGuard,
} from './labor.controller.js';
import { LaborRepository } from './labor.repository.js';
@Module({
  imports: [IamModule],
  controllers: [LaborReadController, LaborWriteController],
  providers: [LaborRepository, WorkforceReadGuard, WorkforceWriteGuard],
})
export class GestionLaboralModule {}
