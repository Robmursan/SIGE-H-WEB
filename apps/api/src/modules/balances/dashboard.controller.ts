import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { CurrentPrincipal } from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { PreparedReads } from '../lecturas/read-http.js';
import { ReadService } from '../lecturas/read.service.js';
import {
  ProgrammingDashboardDto,
  ReadWindowDto,
} from '../lecturas/read.dto.js';
@PreparedReads()
@Controller('tableros')
export class DashboardController {
  constructor(private readonly reads: ReadService) {}
  @Get('coordinacion')
  @ApiOperation({
    operationId: 'getScopedProgrammingIndicators',
    summary:
      'indicadores de programación por servicio, no asistencia/cobertura',
  })
  @ApiOkResponse({ type: ProgrammingDashboardDto })
  summary(@CurrentPrincipal() p: Principal, @Query() q: ReadWindowDto) {
    return this.reads.dashboard(p, q);
  }
}
