import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Headers,
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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import { CalendarSimulationDto } from './calendar.dto.js';
import { CalendarPublicationService } from './calendar-publication.service.js';

export class CalendarPublicationDto extends CalendarSimulationDto {
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @Matches(/^[a-f0-9]{64}$/)
  fingerprint!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyVersion!: string;
}
export class CalendarPublicationResult {
  @ApiProperty({ format: 'uuid' }) publicacionId!: string;
  @ApiProperty() replayed!: boolean;
}
@Injectable()
export class CalendarPublicationGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    if (this.config.get('CAL_PUBLICATION_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('Publicación deshabilitada');
    return true;
  }
}
@ApiTags('CAL publicación (deshabilitada; políticas pendientes)')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ReadHttpErrorDto })
@ApiUnauthorizedResponse({ type: ReadHttpErrorDto })
@ApiForbiddenResponse({ type: ReadHttpErrorDto })
@ApiConflictResponse({ type: ReadHttpErrorDto })
@ApiUnprocessableEntityResponse({ type: ReadHttpErrorDto })
@ApiServiceUnavailableResponse({ type: ReadHttpErrorDto })
@UseGuards(CalendarPublicationGuard, IamAvailabilityGuard, SessionGuard)
@Controller('programaciones')
export class CalendarPublicationController {
  constructor(private readonly publication: CalendarPublicationService) {}
  @Post('generar')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'publishServiceTomorrow',
    description:
      'Preparada, deshabilitada por defecto. PROGRAMACION_PUBLICAR TITULAR y autorización de fuentes; requiere políticas aprobadas, contexto global y ledger SQL revisado. El cliente no aprueba políticas. Nunca genera asistencia. Reintento devuelve publicacionId solo si coincide la solicitud.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: CalendarPublicationResult })
  publish(
    @CurrentPrincipal() actor: Principal,
    @Body() dto: CalendarPublicationDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    // Header validation is also enforced by the service before obtaining a client.
    return this.publication.publish(actor, dto, {
      fecha: dto.fecha,
      fingerprint: dto.fingerprint,
      policyVersion: dto.policyVersion,
      idempotencyKey: key ?? '',
    });
  }
}
