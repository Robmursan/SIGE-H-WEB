import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  Injectable,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
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
  CalendarSimulationDto,
  CalendarSimulationResponseDto,
} from './calendar.dto.js';
import { CalendarSimulationService } from './calendar-simulation.service.js';
@Injectable()
export class CalendarSimulationGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('CAL_SIMULATION_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('Simulación deshabilitada');
    return true;
  }
}
@ApiTags('CAL simulación (deshabilitada)')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ReadHttpErrorDto })
@ApiUnauthorizedResponse({ type: ReadHttpErrorDto })
@ApiForbiddenResponse({ type: ReadHttpErrorDto })
@ApiServiceUnavailableResponse({ type: ReadHttpErrorDto })
@UseGuards(CalendarSimulationGuard, IamAvailabilityGuard, SessionGuard)
@Controller('programaciones')
export class CalendarController {
  constructor(private readonly service: CalendarSimulationService) {}
  @Post('simular')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'simulateServiceTomorrow',
    description:
      'Todo el servicio, mañana local del hospital. Solo lectura SQL; exige PROGRAMACION_SIMULAR. Sin publicación ni asistencia. Conflictos devueltos con HTTP 200.',
  })
  @ApiOkResponse({ type: CalendarSimulationResponseDto })
  simulate(
    @CurrentPrincipal() p: Principal,
    @Body() input: CalendarSimulationDto,
  ) {
    return this.service.simulate(p, input);
  }
}
