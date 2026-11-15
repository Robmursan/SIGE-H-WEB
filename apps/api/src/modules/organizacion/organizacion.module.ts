import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { OrganizationQueries } from './application/organization-queries.js';
import { OrganizationRepository } from './infrastructure/organization.repository.js';

// No HTTP controller until identity, QA and the access matrix are authorized.
@Module({
  imports: [IamModule],
  providers: [OrganizationQueries, OrganizationRepository],
  exports: [OrganizationQueries],
})
export class OrganizacionModule {}
