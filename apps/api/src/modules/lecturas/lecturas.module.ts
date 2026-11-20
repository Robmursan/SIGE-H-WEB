import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { ReadRepository } from './read.repository.js';
import { ReadReadinessGuard, ReadService } from './read.service.js';
@Module({
  imports: [IamModule],
  providers: [ReadRepository, ReadReadinessGuard, ReadService],
  exports: [ReadReadinessGuard, ReadService, IamModule],
})
export class LecturasModule {}
