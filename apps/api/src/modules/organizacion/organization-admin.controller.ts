import {
  applyDecorators,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import {
  AdminHospitalQuery,
  AdminPageQuery,
  AdminOrganizationPage,
  AdminOrganizationTree,
  AdminOrganizationItem,
  CreateDivisionDto,
  CreateServiceDto,
  CreateSubareaDto,
  UpdateOrganizationDto,
} from './organization-admin.dto.js';
import { OrganizationAdminRepository } from './organization-admin.repository.js';
@Injectable()
export class OrganizationAdminReadGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('ORG_ADMIN_READS_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException(
        'Administración organizacional deshabilitada',
      );
    return true;
  }
}
@Injectable()
export class OrganizationAdminWriteGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('ORG_ADMIN_WRITES_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException(
        'Escrituras organizacionales deshabilitadas',
      );
    return true;
  }
}
function AdminApi() {
  return applyDecorators(
    ApiTags('Organización administrativa (deshabilitada)'),
    ApiBearerAuth(),
    ApiBadRequestResponse({ type: ReadHttpErrorDto }),
    ApiUnauthorizedResponse({ type: ReadHttpErrorDto }),
    ApiForbiddenResponse({ type: ReadHttpErrorDto }),
    ApiServiceUnavailableResponse({ type: ReadHttpErrorDto }),
  );
}
@AdminApi()
@UseGuards(OrganizationAdminReadGuard, IamAvailabilityGuard, SessionGuard)
@Controller()
export class OrganizationAdminReadController {
  constructor(private readonly repo: OrganizationAdminRepository) {}
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Get('divisiones/:divisionId')
  @ApiOperation({ operationId: 'getAdminDivision' })
  @ApiParam({ name: 'divisionId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  division(
    @CurrentPrincipal() p: Principal,
    @Param('divisionId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
  ) {
    return this.repo.detail(p, 'divisiones', q.hospitalId, id);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Get('servicios/:servicioId')
  @ApiOperation({ operationId: 'getAdminService' })
  @ApiParam({ name: 'servicioId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  service(
    @CurrentPrincipal() p: Principal,
    @Param('servicioId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
  ) {
    return this.repo.detail(p, 'servicios', q.hospitalId, id);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Get('subareas/:subareaId')
  @ApiOperation({ operationId: 'getAdminSubarea' })
  @ApiParam({ name: 'subareaId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  subarea(
    @CurrentPrincipal() p: Principal,
    @Param('subareaId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
  ) {
    return this.repo.detail(p, 'subareas', q.hospitalId, id);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Get('servicios/:servicioId/subareas')
  @ApiOperation({ operationId: 'listAdminSubareas' })
  @ApiParam({ name: 'servicioId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationPage })
  subareas(
    @CurrentPrincipal() p: Principal,
    @Param('servicioId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminPageQuery,
  ) {
    return this.repo.subareas(p, q.hospitalId, id, q);
  }
  @Get('organizacion/arbol')
  @ApiOperation({
    operationId: 'getAdminOrganizationTree',
    description:
      'Requiere ámbito hospitalario completo y TITULAR. Máximo 1000 nodos por nivel; falla sin devolver árbol parcial.',
  })
  @ApiOkResponse({ type: AdminOrganizationTree })
  tree(@CurrentPrincipal() p: Principal, @Query() q: AdminHospitalQuery) {
    return this.repo.tree(p, q.hospitalId);
  }
}
@AdminApi()
@ApiConflictResponse({
  type: ReadHttpErrorDto,
  description: 'Código duplicado, revisión obsoleta o relación incompatible',
})
@UseGuards(OrganizationAdminWriteGuard, IamAvailabilityGuard, SessionGuard)
@Controller()
export class OrganizationAdminWriteController {
  constructor(private readonly repo: OrganizationAdminRepository) {}
  @Post('divisiones')
  @ApiOperation({ operationId: 'createAdminDivision' })
  @ApiCreatedResponse({ type: AdminOrganizationItem })
  createDivision(
    @CurrentPrincipal() p: Principal,
    @Body() b: CreateDivisionDto,
  ) {
    return this.repo.create(p, 'divisiones', b);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Post('servicios')
  @ApiOperation({ operationId: 'createAdminService' })
  @ApiCreatedResponse({ type: AdminOrganizationItem })
  createService(@CurrentPrincipal() p: Principal, @Body() b: CreateServiceDto) {
    return this.repo.create(p, 'servicios', b);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Post('subareas')
  @ApiOperation({ operationId: 'createAdminSubarea' })
  @ApiCreatedResponse({ type: AdminOrganizationItem })
  createSubarea(@CurrentPrincipal() p: Principal, @Body() b: CreateSubareaDto) {
    return this.repo.create(p, 'subareas', b);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Patch('divisiones/:divisionId')
  @ApiOperation({ operationId: 'updateAdminDivision' })
  @ApiParam({ name: 'divisionId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  updateDivision(
    @CurrentPrincipal() p: Principal,
    @Param('divisionId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
    @Body() b: UpdateOrganizationDto,
  ) {
    return this.repo.update(p, 'divisiones', q.hospitalId, id, b);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Patch('servicios/:servicioId')
  @ApiOperation({ operationId: 'updateAdminService' })
  @ApiParam({ name: 'servicioId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  updateService(
    @CurrentPrincipal() p: Principal,
    @Param('servicioId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
    @Body() b: UpdateOrganizationDto,
  ) {
    return this.repo.update(p, 'servicios', q.hospitalId, id, b);
  }
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @Patch('subareas/:subareaId')
  @ApiOperation({ operationId: 'updateAdminSubarea' })
  @ApiParam({ name: 'subareaId', format: 'uuid' })
  @ApiOkResponse({ type: AdminOrganizationItem })
  updateSubarea(
    @CurrentPrincipal() p: Principal,
    @Param('subareaId', new ParseUUIDPipe()) id: string,
    @Query() q: AdminHospitalQuery,
    @Body() b: UpdateOrganizationDto,
  ) {
    return this.repo.update(p, 'subareas', q.hospitalId, id, b);
  }
}
