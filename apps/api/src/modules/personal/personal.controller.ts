import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../iam/presentation/iam.guards.js';
import { type Principal } from '../iam/domain/session-model.js';
import { PreparedReads } from '../lecturas/read-http.js';
import { ReadHttpErrorDto } from '../lecturas/read-error.dto.js';
import { ReadService } from '../lecturas/read.service.js';
import {
  AssignmentPageDto,
  EmployeeDetailDto,
  EmployeePageDto,
  StaffReadQueryDto,
} from '../lecturas/read.dto.js';
@PreparedReads()
@Controller()
export class PersonalController {
  constructor(private readonly reads: ReadService) {}
  @Get('empleados')
  @ApiOperation({
    operationId: 'listScopedStaff',
    summary: 'padrón vigente por hospital/servicio, sin RUD',
  })
  @ApiOkResponse({ type: EmployeePageDto })
  list(@CurrentPrincipal() p: Principal, @Query() q: StaffReadQueryDto) {
    return this.reads.staff(p, q);
  }
  @Get('empleados/:empleadoId')
  @ApiParam({ name: 'empleadoId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getScopedEmployee',
    summary: 'detalle mínimo y adscripciones visibles, no expediente completo',
  })
  @ApiNotFoundResponse({
    type: ReadHttpErrorDto,
    description:
      'Empleado no disponible, sea inexistente o fuera del padrón visible',
  })
  @ApiOkResponse({ type: EmployeeDetailDto })
  detail(
    @CurrentPrincipal() p: Principal,
    @Param('empleadoId', new ParseUUIDPipe()) id: string,
    @Query() q: StaffReadQueryDto,
  ) {
    return this.reads.detail(p, q, id);
  }
  @Get('contratos/:contratoId/adscripciones')
  @ApiParam({ name: 'contratoId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listScopedAssignments',
    summary:
      'adscripciones vigentes del contrato dentro del servicio autorizado',
  })
  @ApiOkResponse({
    type: AssignmentPageDto,
    description:
      'Página vacía para contrato inexistente o no visible; no revela su existencia',
  })
  assignments(
    @CurrentPrincipal() p: Principal,
    @Param('contratoId', new ParseUUIDPipe()) id: string,
    @Query() q: StaffReadQueryDto,
  ) {
    return this.reads.assignments(p, q, id);
  }
}
