import {
  CanActivate,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IamService } from '../iam/application/iam.service.js';
import { AccessRepository } from '../iam/infrastructure/access.repository.js';
import { assignmentAllows } from '../iam/domain/access-policy.js';
import { type Principal } from '../iam/domain/session-model.js';
import {
  CapturarAsistenciaDto,
  PaseListaQueryDto,
  strictDto,
} from './asistencia.dto.js';
import {
  AsistenciaRepository,
  CAPTURE_PERMISSION,
  READ_PERMISSIONS,
} from './asistencia.repository.js';
@Injectable()
export class AttendanceAvailabilityGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  requireEnabled(): void {
    if (this.config.get<string>('ASISTENCIA_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('Asistencia no habilitada');
  }
  canActivate(): boolean {
    this.requireEnabled();
    return true;
  }
}
@Injectable()
export class AsistenciaService {
  constructor(
    private readonly ready: AttendanceAvailabilityGuard,
    private readonly iam: IamService,
    private readonly access: AccessRepository,
    private readonly repo: AsistenciaRepository,
  ) {}
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        e.code === '23505' &&
        'constraint' in e &&
        e.constraint === 'registros_asistencia_programacion_id_key'
      ) {
        // UNIQUE programacion_id is the final backstop; no retry in an aborted transaction.
        throw new ConflictException('YA_REGISTRADA');
      }
      throw new ServiceUnavailableException(
        'Asistencia no disponible; reintente con la misma clave',
      );
    }
  }
  async list(p: Principal, input: PaseListaQueryDto) {
    this.ready.requireEnabled();
    const q = strictDto(input, PaseListaQueryDto);
    return this.safe(async () => {
      const grants = await this.access.assignments(p.usuarioId);
      const permitted = READ_PERMISSIONS.filter((perm) =>
        grants.some((g) => assignmentAllows(g, q, perm)),
      );
      if (!permitted.length) throw new ForbiddenException('Acceso denegado');
      // Resource query repeats exact ancestry/session predicates; no role-name inference.
      return this.repo.list(p, q);
    });
  }
  async capture(
    p: Principal,
    id: string,
    key: string,
    input: CapturarAsistenciaDto,
  ) {
    this.ready.requireEnabled();
    const b = strictDto(input, CapturarAsistenciaDto);
    return this.safe(async () => {
      const grants = await this.access.assignments(p.usuarioId);
      if (!grants.some((g) => assignmentAllows(g, {}, CAPTURE_PERMISSION)))
        throw new ForbiddenException('Acceso denegado');
      return this.repo.capture(
        p,
        id.toLowerCase(),
        key.toLowerCase(),
        b,
        (scope) => this.iam.authorize(p, CAPTURE_PERMISSION, scope),
      );
    });
  }
}
