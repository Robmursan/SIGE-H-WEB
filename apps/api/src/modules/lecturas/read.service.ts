import {
  CanActivate,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IamService } from '../iam/application/iam.service.js';
import { type Principal } from '../iam/domain/session-model.js';
import { ReadRepository } from './read.repository.js';
import {
  ReadScopeDto,
  StaffReadQueryDto,
  ScheduleReadQueryDto,
  ReadWindowDto,
  validateReadQuery,
} from './read.dto.js';

// Proposed facultades, not inserted/assigned by this package. No role-name inference.
export const READ_PERMISSIONS = {
  personal: 'PERSONAL_CONSULTAR',
  programacion: 'PROGRAMACION_CONSULTAR',
  dashboard: 'TABLERO_CONSULTAR',
} as const;
@Injectable()
export class ReadReadinessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  requireEnabled(): void {
    if (this.config.get<string>('L3A_READS_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('Lecturas aún no habilitadas');
  }
  canActivate(): boolean {
    this.requireEnabled();
    return true;
  }
}
@Injectable()
export class ReadService {
  constructor(
    private readonly ready: ReadReadinessGuard,
    private readonly iam: IamService,
    private readonly repo: ReadRepository,
  ) {}
  private async run<T>(
    p: Principal,
    q: ReadScopeDto,
    permission: string,
    work: () => Promise<T>,
  ): Promise<T> {
    this.ready.requireEnabled();
    await this.iam.authorize(p, permission, {
      hospitalId: q.hospitalId,
      divisionId: q.divisionId,
      servicioId: q.servicioId,
    });
    try {
      return await work();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException('Lectura no disponible');
    }
  }
  staff(p: Principal, input: StaffReadQueryDto) {
    this.ready.requireEnabled();
    const q = validateReadQuery(input, StaffReadQueryDto);
    return this.run(p, q, READ_PERMISSIONS.personal, () =>
      this.repo.staff(p, READ_PERMISSIONS.personal, q),
    );
  }
  detail(p: Principal, input: StaffReadQueryDto, id: string) {
    this.ready.requireEnabled();
    const q = validateReadQuery(input, StaffReadQueryDto);
    return this.run(p, q, READ_PERMISSIONS.personal, () =>
      this.repo.detail(p, READ_PERMISSIONS.personal, q, id),
    );
  }
  assignments(p: Principal, input: StaffReadQueryDto, id: string) {
    this.ready.requireEnabled();
    const q = validateReadQuery(input, StaffReadQueryDto);
    return this.run(p, q, READ_PERMISSIONS.personal, () =>
      this.repo.assignments(p, READ_PERMISSIONS.personal, q, id),
    );
  }
  schedule(p: Principal, input: ScheduleReadQueryDto) {
    this.ready.requireEnabled();
    const q = validateReadQuery(input, ScheduleReadQueryDto);
    return this.run(p, q, READ_PERMISSIONS.programacion, () =>
      this.repo.schedule(p, READ_PERMISSIONS.programacion, q),
    );
  }
  dashboard(p: Principal, input: ReadWindowDto) {
    this.ready.requireEnabled();
    const q = validateReadQuery(input, ReadWindowDto);
    return this.run(p, q, READ_PERMISSIONS.dashboard, () =>
      this.repo.dashboard(p, READ_PERMISSIONS.dashboard, q),
    );
  }
}
