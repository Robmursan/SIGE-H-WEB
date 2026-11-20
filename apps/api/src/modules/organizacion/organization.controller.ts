import {
  Controller,
  Get,
  Headers,
  Query,
  UseGuards,
  Param,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import { OrganizationQueries } from './application/organization-queries.js';
import {
  OrganizationReferencePageDto,
  HospitalReferenceQueryDto,
  DivisionReferenceQueryDto,
  ServiceReferenceQueryDto,
} from './dto/organization-reference.dto.js';

@ApiTags('Organización')
@ApiBearerAuth()
@ApiBadRequestResponse({
  type: ReadHttpErrorDto,
  description:
    'Filtros o cursor inválidos; hospitalId obligatorio en recursos hijos',
})
@ApiUnauthorizedResponse({
  description: 'Sesión inválida',
  type: ReadHttpErrorDto,
})
@ApiForbiddenResponse({
  description: 'Facultad o alcance insuficiente',
  type: ReadHttpErrorDto,
})
@ApiServiceUnavailableResponse({
  type: ReadHttpErrorDto,
  description: 'IAM deshabilitado o persistencia no disponible',
})
@UseGuards(IamAvailabilityGuard, SessionGuard)
@Controller()
export class OrganizationController {
  constructor(private readonly queries: OrganizationQueries) {}

  @Get('hospitales')
  @ApiOperation({
    operationId: 'listAuthorizedHospitals',
    summary: 'Referencias de hospitales autorizados (IDs y estado)',
  })
  @ApiOkResponse({ type: OrganizationReferencePageDto })
  hospitals(
    @Headers('authorization') credential: string | undefined,
    @Query() query: HospitalReferenceQueryDto,
  ) {
    return this.queries.listReferences(credential, 'hospitales', query);
  }
  @Get('hospitales/:hospitalId/divisiones')
  @ApiParam({ name: 'hospitalId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listAuthorizedDivisions',
    summary: 'Referencias de divisiones por hospital autorizado',
  })
  @ApiOkResponse({ type: OrganizationReferencePageDto })
  divisions(
    @Headers('authorization') credential: string | undefined,
    @Param('hospitalId', new ParseUUIDPipe()) hospitalId: string,
    @Query() query: DivisionReferenceQueryDto,
  ) {
    if (
      query.hospitalId &&
      query.hospitalId.toLowerCase() !== hospitalId.toLowerCase()
    )
      throw new BadRequestException('Hospital inconsistente');
    return this.queries.listReferences(credential, 'divisiones', {
      hospitalId,
      divisionId: query.divisionId,
      servicioId: query.servicioId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
  @Get('servicios')
  @ApiOperation({
    operationId: 'listAuthorizedServices',
    summary: 'Referencias de servicios por hospital/división autorizados',
  })
  @ApiOkResponse({ type: OrganizationReferencePageDto })
  services(
    @Headers('authorization') credential: string | undefined,
    @Query() query: ServiceReferenceQueryDto,
  ) {
    return this.queries.listReferences(credential, 'servicios', query);
  }
}
