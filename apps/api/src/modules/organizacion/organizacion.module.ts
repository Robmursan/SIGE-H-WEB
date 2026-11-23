import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { OrganizationQueries } from './application/organization-queries.js';
import { OrganizationRepository } from './infrastructure/organization.repository.js';
import { OrganizationController } from './organization.controller.js';

import {
  OrganizationAdminReadController,
  OrganizationAdminWriteController,
  OrganizationAdminReadGuard,
  OrganizationAdminWriteGuard,
} from './organization-admin.controller.js';
import { OrganizationAdminRepository } from './organization-admin.repository.js';
// New administration is independently disabled; no SQL grants are applied.
@Module({
  imports: [IamModule],
  controllers: [
    OrganizationController,
    OrganizationAdminReadController,
    OrganizationAdminWriteController,
  ],
  providers: [
    OrganizationQueries,
    OrganizationRepository,
    OrganizationAdminRepository,
    OrganizationAdminReadGuard,
    OrganizationAdminWriteGuard,
  ],
  exports: [OrganizationQueries],
})
export class OrganizacionModule {}
