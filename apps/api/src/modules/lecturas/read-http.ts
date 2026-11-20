import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  IamAvailabilityGuard,
  SessionGuard,
} from '../iam/presentation/iam.guards.js';
import { ReadReadinessGuard } from './read.service.js';
import { ReadHttpErrorDto } from './read-error.dto.js';
export function PreparedReads() {
  return applyDecorators(
    ApiTags('Lecturas hospitalarias'),
    ApiBearerAuth(),
    ApiBadRequestResponse({
      description: 'Ámbito, fecha, intervalo o paginación inválidos',
      type: ReadHttpErrorDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Sesión inválida',
      type: ReadHttpErrorDto,
    }),
    ApiForbiddenResponse({
      description: 'Facultad o ámbito insuficiente',
      type: ReadHttpErrorDto,
    }),
    ApiServiceUnavailableResponse({
      type: ReadHttpErrorDto,
      description:
        'Lecturas deshabilitadas o no disponibles; requiere IAM_V2_ENABLED y L3A_READS_ENABLED',
    }),
    UseGuards(ReadReadinessGuard, IamAvailabilityGuard, SessionGuard),
  );
}
