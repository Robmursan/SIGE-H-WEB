import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { CurrentPrincipal } from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { PreparedReads } from '../lecturas/read-http.js';
import { ReadService } from '../lecturas/read.service.js';
import { SchedulePageDto, ScheduleReadQueryDto } from '../lecturas/read.dto.js';
@PreparedReads()
@Controller('programaciones')
export class ProgramacionController {
  constructor(private readonly reads: ReadService) {}
  @Get()
  @ApiOperation({
    operationId: 'listScopedWeeklyProgramming',
    summary: 'programación por servicio, ventana de hasta 168 horas',
  })
  @ApiOkResponse({ type: SchedulePageDto })
  list(@CurrentPrincipal() p: Principal, @Query() q: ScheduleReadQueryDto) {
    return this.reads.schedule(p, q);
  }
}
