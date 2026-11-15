import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IDENTITY_VERIFIER } from './application/identity-verifier.port.js';
import { AccessRepository } from './infrastructure/access.repository.js';
import { IamRepository } from './infrastructure/iam.repository.js';
import { IamSettings } from './domain/iam-settings.js';
import { PasswordHasher } from './domain/password-hasher.js';
import { IamService } from './application/iam.service.js';
import { AuthController } from './presentation/auth.controller.js';
import {
  IamAvailabilityGuard,
  SessionGuard,
  OrganizationScopeGuard,
} from './presentation/iam.guards.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AccessRepository,
    IamRepository,
    IamSettings,
    PasswordHasher,
    IamService,
    IamAvailabilityGuard,
    SessionGuard,
    OrganizationScopeGuard,
    { provide: IDENTITY_VERIFIER, useExisting: IamService },
  ],
  exports: [
    AccessRepository,
    IDENTITY_VERIFIER,
    IamService,
    SessionGuard,
    OrganizationScopeGuard,
    IamAvailabilityGuard,
  ],
})
export class IamModule {}
