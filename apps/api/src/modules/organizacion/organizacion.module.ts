import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { OrganizationQueries } from './application/organization-queries.js';
import { OrganizationRepository } from './infrastructure/organization.repository.js';
import { OrganizationController } from './organization.controller.js';

// HTTP exposes only the projection allowed by the current QA SQL grants.
@Module({
  imports: [IamModule],
  controllers: [OrganizationController],
  providers: [OrganizationQueries, OrganizationRepository],
  exports: [OrganizationQueries],
})
export class OrganizacionModule {}
