import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { isUUID } from 'class-validator';
import { IamSettings } from '../domain/iam-settings.js';
import { type Principal } from '../domain/session-model.js';
import { IamService } from '../application/iam.service.js';

type AuthRequest = Request & { auth?: Principal };
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const p = context.switchToHttp().getRequest<AuthRequest>().auth;
    if (!p) throw new UnauthorizedException('Sesión inválida');
    return p;
  },
);
@Injectable()
export class IamAvailabilityGuard implements CanActivate {
  constructor(private readonly settings: IamSettings) {}
  canActivate(context: ExecutionContext): boolean {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    if (!this.settings.enabled)
      throw new ServiceUnavailableException('IAM no disponible');
    return true;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly iam: IamService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.iam.verify(request.headers.authorization);
    return true;
  }
}
const PERMISSION = Symbol('SIGEH_PERMISSION');
export const RequirePermission = (permission: string, titularOnly = false) =>
  SetMetadata(PERMISSION, { permission, titularOnly });
@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly iam: IamService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{
      permission: string;
      titularOnly: boolean;
    }>(PERMISSION, [context.getHandler(), context.getClass()]);
    if (!meta?.permission) throw new ForbiddenException('Acceso denegado');
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!req.auth) throw new UnauthorizedException('Sesión inválida');
    const pick = (key: string) => req.params[key] ?? req.query[key];
    const hospitalId = pick('hospitalId'),
      divisionId = pick('divisionId'),
      servicioId = pick('servicioId');
    if (
      typeof hospitalId !== 'string' ||
      !isUUID(hospitalId) ||
      [divisionId, servicioId].some(
        (v) => v !== undefined && (typeof v !== 'string' || !isUUID(v)),
      )
    )
      throw new BadRequestException('Ámbito inválido');
    await this.iam.authorize(
      req.auth,
      meta.permission,
      {
        hospitalId,
        divisionId: divisionId as string | undefined,
        servicioId: servicioId as string | undefined,
      },
      meta.titularOnly,
    );
    return true;
  }
}
