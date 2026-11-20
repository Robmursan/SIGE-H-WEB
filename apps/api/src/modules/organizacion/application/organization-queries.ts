import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
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
import { IamService } from '../../iam/application/iam.service.js';
import { type OrganizationReferencePageDto } from '../dto/organization-reference.dto.js';

@Injectable()
export class OrganizationQueries {
  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
    private readonly access: AccessRepository,
    private readonly repository: OrganizationRepository,
    private readonly iam: IamService,
  ) {}

  async listReferences(
    credential: string | undefined,
    catalog: Exclude<OrganizationCatalog, 'subareas'>,
    input: unknown,
  ): Promise<OrganizationReferencePageDto> {
    let query;
    try {
      query = parseOrganizationQuery(input, catalog);
    } catch {
      throw new BadRequestException('Consulta organizacional inválida');
    }
    const subject = await this.iam.verify(credential);
    try {
      const grants = await this.access.assignments(subject.usuarioId);
      const candidate = grants.find((g) =>
        assignmentAllows(g, query, ORGANIZATION_CATALOG_PERMISSION),
      );
      // An absent candidate still passes through the audited deny-by-default policy.
      await this.iam.authorize(subject, ORGANIZATION_CATALOG_PERMISSION, {
        hospitalId: query.hospitalId ?? candidate?.scope.hospitalId,
        divisionId: query.divisionId ?? candidate?.scope.divisionId,
        servicioId: query.servicioId ?? candidate?.scope.servicioId,
      });
      return await this.repository.references(
        subject.usuarioId,
        catalog,
        query,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta organizacional no disponible',
      );
    }
  }

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
