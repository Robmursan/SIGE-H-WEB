import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import {
  CapturarAsistenciaDto,
  CaptureReceiptDto,
  PaseListaPageDto,
  PaseListaQueryDto,
} from './asistencia.dto.js';
import {
  AsistenciaService,
  AttendanceAvailabilityGuard,
} from './asistencia.service.js';
function PreparedAttendance() {
  return applyDecorators(
    ApiTags('Asistencia operativa'),
    ApiBearerAuth(),
    ApiBadRequestResponse({ type: ReadHttpErrorDto }),
    ApiUnauthorizedResponse({ type: ReadHttpErrorDto }),
    ApiForbiddenResponse({ type: ReadHttpErrorDto }),
    ApiNotFoundResponse({ type: ReadHttpErrorDto }),
    ApiServiceUnavailableResponse({
      type: ReadHttpErrorDto,
      description:
        'Deshabilitado por defecto o resultado transaccional incierto; reintentar con la misma clave',
    }),
    UseGuards(AttendanceAvailabilityGuard, IamAvailabilityGuard, SessionGuard),
  );
}
@PreparedAttendance()
@Controller()
export class AsistenciaController {
  constructor(private readonly service: AsistenciaService) {}
  @Get('pases-lista')
  @ApiOperation({
    operationId: 'listScopedAttendanceRoster',
    summary:
      'Jornadas y asistencia operativa por fecha local; sin clasificación de incidencias',
  })
  @ApiOkResponse({ type: PaseListaPageDto })
  list(@CurrentPrincipal() p: Principal, @Query() q: PaseListaQueryDto) {
    return this.service.list(p, q);
  }
  @Put('programaciones/:programacionId/asistencia')
  @ApiOperation({
    operationId: 'captureInitialAttendance',
    summary:
      'Primera captura online; ASISTENCIA_CAPTURAR y ámbito vigente; no valida ni crea incidencias',
  })
  @ApiParam({ name: 'programacionId', type: String, format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      format: 'uuid',
      description: 'UUID v4 estable para actor+jornada; conservar tras timeout',
    },
  })
  @ApiOkResponse({ type: CaptureReceiptDto })
  @ApiConflictResponse({
    type: ReadHttpErrorDto,
    description:
      'Registro existente, clave con contenido distinto, jornada no elegible o cierre existente',
  })
  capture(
    @CurrentPrincipal() p: Principal,
    @Param('programacionId') id: string,
    @Headers('idempotency-key') key: string,
    @Body() b: CapturarAsistenciaDto,
  ) {
    if (
      typeof id !== 'string' ||
      !isUUID(id) ||
      typeof key !== 'string' ||
      !isUUID(key, '4')
    )
      throw new BadRequestException('Identificador o clave inválidos');
    return this.service.capture(p, id, key, b);
  }
}
