import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PostgresService } from '../../../database/postgres.service.js';
import { type Principal } from '../domain/session-model.js';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from './iam.guards.js';
import { ReadHttpErrorDto } from '../../lecturas/read-error.dto.js';
export class OwnContextDto {
  @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @ApiProperty({ format: 'uuid' }) hospitalId!: string;
  @ApiProperty() hospitalNombre!: string;
  @ApiProperty() zonaHoraria!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) divisionId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) divisionNombre!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) servicioId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) servicioNombre!: string | null;
  @ApiProperty({ enum: ['TITULAR', 'ENCARGADO'] }) tipo!: string;
  @ApiProperty({ format: 'date-time' }) vigenteDesde!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  vigenteHasta!: string | null;
  @ApiProperty({ type: [String] }) permisos!: string[];
}
export const OWN_CONTEXT_SQL = `SELECT ur.usuario_rol_id AS "assignmentId",h.hospital_id AS "hospitalId",h.nombre AS "hospitalNombre",h.zona_horaria AS "zonaHoraria",
 d.division_id AS "divisionId",d.nombre AS "divisionNombre",s.servicio_id AS "servicioId",s.nombre AS "servicioNombre",ctx.tipo,
 GREATEST(ur.vigente_desde,ctx.mandato_desde) AS "vigenteDesde",LEAST(ur.vigente_hasta,ctx.mandato_hasta) AS "vigenteHasta",
 ARRAY(SELECT DISTINCT p.codigo FROM sigeh.rol_permisos rp JOIN sigeh.permisos p ON p.permiso_id=rp.permiso_id
 WHERE rp.rol_id=ur.rol_id AND (ctx.tipo='TITULAR' OR EXISTS(SELECT 1 FROM sigeh.encargo_permisos ep WHERE ep.usuario_rol_id=ur.usuario_rol_id AND ep.permiso_id=p.permiso_id)) ORDER BY p.codigo) AS permisos
 FROM sigeh.usuarios u JOIN sigeh.usuario_roles ur ON ur.usuario_id=u.usuario_id
 JOIN sigeh.usuario_roles_contexto ctx ON ctx.usuario_rol_id=ur.usuario_rol_id
 JOIN sigeh.hospitales h ON h.hospital_id=ur.hospital_id AND h.activo
 LEFT JOIN sigeh.servicios s ON s.servicio_id=ur.servicio_id AND s.hospital_id=h.hospital_id AND s.activo
 LEFT JOIN sigeh.divisiones d ON d.division_id=COALESCE(ur.division_id,s.division_id) AND d.hospital_id=h.hospital_id AND d.activo
 WHERE u.usuario_id=$1::uuid AND u.activo AND ur.vigente_desde<=CURRENT_TIMESTAMP AND (ur.vigente_hasta IS NULL OR ur.vigente_hasta>CURRENT_TIMESTAMP)
 AND ctx.mandato_desde<=CURRENT_TIMESTAMP AND (ctx.mandato_hasta IS NULL OR ctx.mandato_hasta>CURRENT_TIMESTAMP)
 AND (ctx.tipo='TITULAR' OR (ctx.tipo='ENCARGADO' AND ctx.mandato_hasta IS NOT NULL))
 AND (ur.servicio_id IS NULL OR s.servicio_id IS NOT NULL)
 AND (COALESCE(ur.division_id,s.division_id) IS NULL OR d.division_id IS NOT NULL)
 AND (ur.division_id IS NULL OR ur.servicio_id IS NULL OR s.division_id=ur.division_id)
 AND EXISTS(SELECT 1 FROM sigeh.sesiones_usuario se WHERE se.usuario_id=u.usuario_id AND se.sesion_id=$2::uuid AND se.revocada_en IS NULL AND se.expira_en>CURRENT_TIMESTAMP AND se.inactiva_en>CURRENT_TIMESTAMP)
 ORDER BY ur.usuario_rol_id LIMIT 1001`;
@Injectable()
export class OwnContextsRepository {
  constructor(private readonly postgres: PostgresService) {}
  async list(actor: Principal): Promise<OwnContextDto[]> {
    try {
      return await this.postgres.withTransaction(
        async (client) => {
          const r = await client.query<OwnContextDto>(OWN_CONTEXT_SQL, [
            actor.usuarioId,
            actor.sesionId,
          ]);
          if (r.rows.length > 1000)
            throw new ServiceUnavailableException(
              'Demasiados contextos; revisión de asignaciones requerida',
            );
          return r.rows;
        },
        { readOnly: true },
      );
    } catch {
      throw new ServiceUnavailableException('Contextos no disponibles');
    }
  }
}
@ApiTags('IAM')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ReadHttpErrorDto })
@ApiUnauthorizedResponse({ type: ReadHttpErrorDto })
@ApiServiceUnavailableResponse({ type: ReadHttpErrorDto })
@UseGuards(IamAvailabilityGuard, SessionGuard)
@Controller('auth/me')
export class OwnContextsController {
  constructor(private readonly repo: OwnContextsRepository) {}
  @Get('contextos')
  @ApiOperation({
    operationId: 'iamOwnContexts',
    summary:
      'Contextos propios vigentes con nombres; no enumera hijos ni requiere CATALOGOS_ADMINISTRAR',
  })
  @ApiOkResponse({ type: OwnContextDto, isArray: true })
  contexts(
    @CurrentPrincipal() actor: Principal,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw new BadRequestException('Contextos propios no admite filtros');
    return this.repo.list(actor);
  }
}
