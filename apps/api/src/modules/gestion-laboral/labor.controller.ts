import {
  applyDecorators,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import { LaborRepository } from './labor.repository.js';
import {
  AdscriptionDto,
  LaborConfigurationDto,
  LaborConfigurationQuery,
  AssignPatternDto,
  CreateAdscriptionDto,
  CreateHoursDto,
  CreateLaborIncidentDto,
  CreatePatternDto,
  CreateRotationDto,
  EligiblePageDto,
  EligibleQueryDto,
  EmployeePatternDto,
  HoursDto,
  HoursPageDto,
  IncidentsPageDto,
  IncidentVersionDto,
  LaborDateQuery,
  LaborIncidentDto,
  LaborIncidentQuery,
  LaborIncidentHistoryQuery,
  LaborPageDto,
  PatternDto,
  PatternsPageDto,
  RotationDto,
  RotationPageDto,
} from './labor.dto.js';
@Injectable()
export class WorkforceReadGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('WORKFORCE_READS_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException(
        'Lecturas laborales deshabilitadas',
      );
    return true;
  }
}
@Injectable()
export class WorkforceWriteGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('WORKFORCE_WRITES_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('Gestión laboral deshabilitada');
    return true;
  }
}
function LaborApi() {
  return applyDecorators(
    ApiTags('Circuito laboral (deshabilitado)'),
    ApiBearerAuth(),
    ApiBadRequestResponse({ type: ReadHttpErrorDto }),
    ApiUnauthorizedResponse({ type: ReadHttpErrorDto }),
    ApiForbiddenResponse({ type: ReadHttpErrorDto }),
    ApiServiceUnavailableResponse({ type: ReadHttpErrorDto }),
  );
}
@LaborApi()
@UseGuards(WorkforceReadGuard, IamAvailabilityGuard, SessionGuard)
@Controller()
export class LaborReadController {
  constructor(private readonly repo: LaborRepository) {}
  @Get('contratos/:contratoId/configuracion-laboral')
  @ApiParam({ name: 'contratoId', format: 'uuid' })
  @ApiUnprocessableEntityResponse({ type: ReadHttpErrorDto })
  @ApiOperation({
    operationId: 'getContractLaborConfiguration',
    description:
      'PROGRAMACION_CONSULTAR, ámbito y adscripción vigentes en fecha solicitada. Patrones/horarios/descansos explícitos; no implica programación, asistencia ni aprobación de cambios de descanso.',
  })
  @ApiOkResponse({ type: LaborConfigurationDto })
  configuration(
    @CurrentPrincipal() p: Principal,
    @Param('contratoId', new ParseUUIDPipe()) id: string,
    @Query() q: LaborConfigurationQuery,
  ) {
    return this.repo.configuration(p, id, q);
  }
  @Get('personal/elegibles')
  @ApiOperation({
    operationId: 'listEligibleContracts',
    description:
      'TITULAR hospitalario con ADSCRIPCIONES_GESTIONAR. Filas por contrato; no sumar como dotación.',
  })
  @ApiOkResponse({ type: EligiblePageDto })
  eligible(@CurrentPrincipal() p: Principal, @Query() q: EligibleQueryDto) {
    return this.repo.eligible(p, q);
  }
  @Get('servicios/:servicioId/distribucion')
  @ApiParam({ name: 'servicioId', format: 'uuid' })
  @ApiOperation({
    operationId: 'listServiceRotations',
    description:
      'PERSONAL_DISTRIBUIR. Rotaciones planificadas; no incorporación ni cobertura efectiva.',
  })
  @ApiOkResponse({ type: RotationPageDto })
  distribution(
    @CurrentPrincipal() p: Principal,
    @Param('servicioId', new ParseUUIDPipe()) id: string,
    @Query() q: LaborDateQuery,
  ) {
    return this.repo.distribution(p, id, q);
  }
  @Get('horarios')
  @ApiOperation({
    operationId: 'listLaborSchedules',
    description:
      'PROGRAMACION_CONSULTAR y ámbito vigente; catálogo compartido V1.',
  })
  @ApiOkResponse({ type: HoursPageDto })
  hours(@CurrentPrincipal() p: Principal, @Query() q: LaborPageDto) {
    return this.repo.hours(p, q);
  }
  @Get('patrones-laborales')
  @ApiOperation({
    operationId: 'listLaborPatterns',
    description: 'PROGRAMACION_CONSULTAR y ámbito vigente.',
  })
  @ApiOkResponse({ type: PatternsPageDto })
  patterns(@CurrentPrincipal() p: Principal, @Query() q: LaborPageDto) {
    return this.repo.patterns(p, q);
  }
  @Get('incidencias')
  @ApiUnprocessableEntityResponse({ type: ReadHttpErrorDto })
  @ApiOperation({
    operationId: 'listLaborIncidents',
    description:
      'VACACIONES_CONSULTAR o INCAPACIDADES_CONSULTAR, vínculo y ámbito; sin motivos clínicos ni documentos.',
  })
  @ApiOkResponse({ type: IncidentsPageDto })
  incidents(@CurrentPrincipal() p: Principal, @Query() q: LaborIncidentQuery) {
    return this.repo.incidents(p, q);
  }
  @Get('incidencias/:incidenciaId/versiones')
  @ApiParam({ name: 'incidenciaId', format: 'uuid' })
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @ApiUnprocessableEntityResponse({ type: ReadHttpErrorDto })
  @ApiOperation({ operationId: 'listLaborIncidentVersions' })
  @ApiOkResponse({ type: IncidentVersionDto, isArray: true })
  versions(
    @CurrentPrincipal() p: Principal,
    @Param('incidenciaId', new ParseUUIDPipe()) id: string,
    @Query() q: LaborIncidentHistoryQuery,
  ) {
    return this.repo.versions(p, id, q);
  }
}
@LaborApi()
@ApiConflictResponse({ type: ReadHttpErrorDto })
@ApiUnprocessableEntityResponse({ type: ReadHttpErrorDto })
@UseGuards(WorkforceWriteGuard, IamAvailabilityGuard, SessionGuard)
@Controller()
export class LaborWriteController {
  constructor(private readonly repo: LaborRepository) {}
  @Post('contratos/:contratoId/adscripciones')
  @ApiParam({ name: 'contratoId', format: 'uuid' })
  @ApiOperation({
    operationId: 'createFormalAdscription',
    description:
      'ADSCRIPCIONES_GESTIONAR, TITULAR hospitalario. Solapamiento requiere movimiento formal; no sustituye historia.',
  })
  @ApiCreatedResponse({ type: AdscriptionDto })
  adscription(
    @CurrentPrincipal() p: Principal,
    @Param('contratoId', new ParseUUIDPipe()) id: string,
    @Body() b: CreateAdscriptionDto,
  ) {
    return this.repo.adscription(p, id, b);
  }
  @Post('servicios/:servicioId/rotaciones')
  @ApiParam({ name: 'servicioId', format: 'uuid' })
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @ApiOperation({
    operationId: 'createServiceRotation',
    description:
      'PERSONAL_DISTRIBUIR, TITULAR. Rotación interna sin cambio contractual ni incorporación.',
  })
  @ApiCreatedResponse({ type: RotationDto })
  rotation(
    @CurrentPrincipal() p: Principal,
    @Param('servicioId', new ParseUUIDPipe()) id: string,
    @Body() b: CreateRotationDto,
  ) {
    return this.repo.rotation(p, id, b);
  }
  @Post('horarios')
  @ApiOperation({
    operationId: 'createLaborSchedule',
    description:
      'HORARIOS_CONFIGURAR, TITULAR hospitalario. Crea catálogo compartido; no altera horarios existentes.',
  })
  @ApiCreatedResponse({ type: HoursDto })
  hours(@CurrentPrincipal() p: Principal, @Body() b: CreateHoursDto) {
    return this.repo.createHours(p, b);
  }
  @Post('patrones-laborales')
  @ApiNotFoundResponse({ type: ReadHttpErrorDto })
  @ApiOperation({
    operationId: 'createLaborPattern',
    description:
      'HORARIOS_CONFIGURAR, TITULAR hospitalario; horario explícito y siete días ISO.',
  })
  @ApiCreatedResponse({ type: PatternDto })
  pattern(@CurrentPrincipal() p: Principal, @Body() b: CreatePatternDto) {
    return this.repo.createPattern(p, b);
  }
  @Post('contratos/:contratoId/patrones')
  @ApiParam({ name: 'contratoId', format: 'uuid' })
  @ApiOperation({
    operationId: 'assignContractPattern',
    description:
      'PATRONES_ASIGNAR, TITULAR hospitalario; sin solapamiento ni configuración implícita.',
  })
  @ApiCreatedResponse({ type: EmployeePatternDto })
  assignPattern(
    @CurrentPrincipal() p: Principal,
    @Param('contratoId', new ParseUUIDPipe()) id: string,
    @Body() b: AssignPatternDto,
  ) {
    return this.repo.assignPattern(p, id, b);
  }
  @Post('vacaciones')
  @ApiOperation({
    operationId: 'captureVacationPeriod',
    description:
      'VACACIONES_REGISTRAR, TITULAR. Catálogo VACACIONES autorizado por hospital; solo CAPTURADA. No aprueba ni altera asistencia.',
  })
  @ApiCreatedResponse({ type: LaborIncidentDto })
  vacation(
    @CurrentPrincipal() p: Principal,
    @Body() b: CreateLaborIncidentDto,
  ) {
    return this.repo.incident(p, 'VACACIONES', b);
  }
  @Post('incapacidades')
  @ApiOperation({
    operationId: 'captureDisabilityPeriod',
    description:
      'INCAPACIDADES_REGISTRAR, TITULAR. Catálogo INCAPACIDAD autorizado por hospital; solo CAPTURADA. Sin diagnóstico/documentos médicos.',
  })
  @ApiCreatedResponse({ type: LaborIncidentDto })
  disability(
    @CurrentPrincipal() p: Principal,
    @Body() b: CreateLaborIncidentDto,
  ) {
    return this.repo.incident(p, 'INCAPACIDAD', b);
  }
}
