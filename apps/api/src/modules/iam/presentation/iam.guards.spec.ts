import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationScopeGuard, RequirePermission } from './iam.guards.js';
import { iamFixture, USER, OTHER } from '../../../../test/fixtures/iam-mock.js';
import { type IamService } from '../application/iam.service.js';
import { type PersistedAssignment } from '../domain/access-policy.js';

const hospital = '22222222-2222-4222-8222-222222222222';
function scopeGrant(): PersistedAssignment {
  return {
    kind: 'ENCARGADO',
    mandateFrom: new Date(Date.now() - 10000),
    mandateUntil: new Date(Date.now() + 60000),
    encargoPermissions: ['READ'],
    usuarioActivo: true,
    hospitalActivo: true,
    scope: { hospitalId: hospital, divisionId: null, servicioId: null },
    division: null,
    servicio: null,
    vigenteDesde: new Date(Date.now() - 10000),
    vigenteHasta: null,
    observedAt: new Date(),
    permissions: ['READ'],
  };
}
describe('Guardia de ámbito y decisiones auditadas', () => {
  it('deniega sin metadata, sin aceptar permisos del request', async () => {
    const iam = { authorize: vi.fn() };
    const guard = new OrganizationScopeGuard(
      new Reflector(),
      iam as unknown as IamService,
    );
    const context = {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { usuarioId: USER },
          query: { permission: 'ADMIN' },
        }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
    expect(iam.authorize).not.toHaveBeenCalled();
  });
  it('extrae solo ámbito validado y transmite titularOnly del decorador de servidor', async () => {
    class Handler {
      run(this: void) {}
    }
    RequirePermission('READ', true)(
      Handler.prototype,
      'run',
      Object.getOwnPropertyDescriptor(Handler.prototype, 'run')!,
    );
    const iam = { authorize: vi.fn() };
    const guard = new OrganizationScopeGuard(
      new Reflector(),
      iam as unknown as IamService,
    );
    const req = {
      auth: { usuarioId: USER, sesionId: OTHER },
      params: { hospitalId: hospital },
      query: { permission: 'ADMIN' },
    };
    const context = {
      getHandler: () => Handler.prototype.run,
      getClass: () => Handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    expect(await guard.canActivate(context)).toBe(true);
    expect(iam.authorize).toHaveBeenCalledWith(
      req.auth,
      'READ',
      { hospitalId: hospital, divisionId: undefined, servicioId: undefined },
      true,
    );
    req.params.hospitalId = 'invalid';
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('revalida pertenencia real, distingue titular y audita ALLOW/DENY', async () => {
    const f = iamFixture();
    f.access.assignments.mockResolvedValue([scopeGrant()] as never);
    const p = { usuarioId: USER, sesionId: OTHER };
    await f.service.authorize(p, 'READ', { hospitalId: hospital });
    expect(f.audits.at(-1)?.resultado).toBe('ALLOW');
    await expect(
      f.service.authorize(p, 'READ', { hospitalId: hospital }, true),
    ).rejects.toMatchObject({ status: 403 });
    f.access.scopeExists.mockResolvedValue(false);
    await expect(
      f.service.authorize(p, 'READ', { hospitalId: hospital }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.audits.at(-1)?.resultado).toBe('DENY');
  });
});
