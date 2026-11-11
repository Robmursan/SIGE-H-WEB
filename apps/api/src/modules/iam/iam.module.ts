import { Module } from '@nestjs/common';
import {
  IDENTITY_VERIFIER,
  UnavailableIdentityVerifier,
} from './application/identity-verifier.port.js';
import { AccessRepository } from './infrastructure/access.repository.js';

@Module({
  providers: [
    AccessRepository,
    { provide: IDENTITY_VERIFIER, useClass: UnavailableIdentityVerifier },
  ],
  exports: [AccessRepository, IDENTITY_VERIFIER],
})
export class IamModule {}
