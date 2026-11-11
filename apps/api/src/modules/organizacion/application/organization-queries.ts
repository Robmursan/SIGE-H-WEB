import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  IDENTITY_VERIFIER,
  type IdentityVerifier,
} from '../../iam/application/identity-verifier.port.js';
import {
  assignmentAllows,
  ORGANIZATION_CATALOG_PERMISSION,
} from '../../iam/domain/access-policy.js';
import { AccessRepository } from '../../iam/infrastructure/access.repository.js';
import { OrganizationRepository } from '../infrastructure/organization.repository.js';
import {
  parseOrganizationQuery,
  type OrganizationCatalog,
} from '../dto/organization-query.dto.js';

@Injectable()
export class OrganizationQueries {
  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
    private readonly access: AccessRepository,
    private readonly repository: OrganizationRepository,
  ) {}

  async list(
    credential: string | undefined,
    catalog: OrganizationCatalog,
    input: unknown,
  ) {
    const query = parseOrganizationQuery(input, catalog);
    const subject = await this.identity.verify(credential);
    if (!isUUID(subject.usuarioId)) throw new Error('IDENTIDAD_NO_VERIFICABLE');
    const grants = await this.access.assignments(subject.usuarioId);
    if (
      !grants.some((grant) =>
        assignmentAllows(grant, query, ORGANIZATION_CATALOG_PERMISSION),
      )
    ) {
      throw new Error('ACCESO_ORG_DENEGADO');
    }
    return this.repository.list(subject.usuarioId, catalog, query);
  }
}
