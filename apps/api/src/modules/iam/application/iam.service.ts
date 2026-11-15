import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import {
  type IdentityVerifier,
  IdentityUnavailableError,
} from './identity-verifier.port.js';
import { IamSettings } from '../domain/iam-settings.js';
import { HashBusyError, PasswordHasher } from '../domain/password-hasher.js';
import {
  type Principal,
  type Session,
  type AuthTransaction,
} from '../domain/session-model.js';
import { IamRepository } from '../infrastructure/iam.repository.js';
import { AccessRepository } from '../infrastructure/access.repository.js';
import {
  assignmentAllows,
  type OrganizationScope,
} from '../domain/access-policy.js';

type AuthResult =
  | {
      ok: true;
      session: Session;
      access: string;
      refresh: string;
      expiresIn: number;
    }
  | { ok: false; limited?: boolean };
const invalid = () =>
  new UnauthorizedException('Credenciales o sesión inválidas');

@Injectable()
export class IamService implements IdentityVerifier {
  constructor(
    private readonly settings: IamSettings,
    private readonly passwords: PasswordHasher,
    private readonly jwt: JwtService,
    private readonly repository: IamRepository,
    private readonly access: AccessRepository,
  ) {}

  private async storage<T>(work: () => Promise<T>): Promise<T> {
    if (!this.settings.enabled)
      throw new ServiceUnavailableException('IAM no disponible');
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('IAM no disponible');
    }
  }
  private bucket(domain: string, value: string): string {
    return createHmac('sha256', this.settings.secret)
      .update(`sigeh:${domain}:${value}`)
      .digest('hex');
  }
  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private valid(s: Session, now: Date): boolean {
    return (
      !s.revocada_en &&
      s.expira_en.getTime() > now.getTime() &&
      s.inactiva_en.getTime() > now.getTime()
    );
  }
  private async issue(
    tx: AuthTransaction,
    s: Session,
    old?: string,
  ): Promise<AuthResult> {
    const token = randomBytes(48).toString('base64url');
    const id = randomUUID();
    if (old) await tx.consumeRefresh(old, id, await tx.now());
    await tx.insertRefresh(id, s.sesion_id, this.digest(token), s.expira_en);
    const now = await tx.now();
    const ttl = Math.min(
      this.settings.accessSeconds,
      Math.floor((s.expira_en.getTime() - now.getTime()) / 1000),
      Math.floor((s.inactiva_en.getTime() - now.getTime()) / 1000),
    );
    if (ttl < 1) throw invalid();
    const access = await this.jwt.signAsync(
      {
        sub: s.usuario_id,
        sid: s.sesion_id,
        jti: randomUUID(),
        token_use: 'access',
      },
      {
        secret: this.settings.secret,
        algorithm: 'HS256',
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        expiresIn: ttl,
        header: { alg: 'HS256', typ: 'at+jwt' },
      },
    );
    return { ok: true, session: s, access, refresh: token, expiresIn: ttl };
  }
  private response(r: AuthResult) {
    if (!r.ok) {
      if (r.limited)
        throw new HttpException(
          'Demasiados intentos',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      throw invalid();
    }
    return {
      accessToken: r.access,
      refreshToken: r.refresh,
      tokenType: 'Bearer' as const,
      expiresIn: r.expiresIn,
      sessionId: r.session.sesion_id,
    };
  }
  async login(identifier: string, password: string, ip: string) {
    const r = await this.storage(() =>
      this.repository.transaction<AuthResult>(async (tx) => {
        const ipAllowed = await tx.attempt(
          this.bucket('login-ip', ip),
          this.settings.ipAttempts,
          this.settings.windowSeconds,
        );
        if (!ipAllowed) {
          await tx.audit({ evento: 'LOGIN_LIMIT', resultado: 'DENY' });
          return { ok: false, limited: true };
        }
        const accountAllowed = await tx.attempt(
          this.bucket('login-account', identifier),
          this.settings.accountAttempts,
          this.settings.windowSeconds,
        );
        if (!ipAllowed || !accountAllowed) {
          await tx.audit({ evento: 'LOGIN_LIMIT', resultado: 'DENY' });
          return { ok: false, limited: true };
        }
        const c = await tx.credential(identifier);
        let match: boolean;
        try {
          match = await this.passwords.verify(
            password,
            c?.algoritmo === 'ARGON2ID' ? c.password_hash : null,
          );
        } catch (error) {
          if (!(error instanceof HashBusyError)) throw error;
          await tx.audit({ evento: 'LOGIN_CAPACITY', resultado: 'DENY' });
          return { ok: false, limited: true };
        }
        const now = await tx.now();
        const locked = c?.bloqueada_hasta != null && c.bloqueada_hasta > now;
        if (
          !c ||
          !match ||
          !c.activo ||
          c.requiere_cambio ||
          locked ||
          !(await tx.userActive(c.usuario_id))
        ) {
          if (c && !locked)
            await tx.credentialAttempt(
              c.usuario_id,
              false,
              now,
              this.settings.accountAttempts,
              this.settings.windowSeconds,
            );
          await tx.audit({
            evento: 'LOGIN_INVALID',
            resultado: 'DENY',
            objetivo: c?.usuario_id,
          });
          return { ok: false };
        }
        await tx.credentialAttempt(
          c.usuario_id,
          true,
          now,
          this.settings.accountAttempts,
          this.settings.windowSeconds,
        );
        const session: Session = {
          sesion_id: randomUUID(),
          usuario_id: c.usuario_id,
          creada_en: now,
          ultima_actividad_en: now,
          revocada_en: null,
          expira_en: new Date(
            now.getTime() + this.settings.absoluteSeconds * 1000,
          ),
          inactiva_en: new Date(
            now.getTime() + this.settings.idleSeconds * 1000,
          ),
        };
        await tx.createSession(session);
        const issued = await this.issue(tx, session);
        await tx.audit({
          evento: 'LOGIN_OK',
          resultado: 'ALLOW',
          actor: c.usuario_id,
          sesion: session.sesion_id,
        });
        return issued;
      }),
    );
    // Expected failures are thrown AFTER the audit/rate transaction commits.
    return this.response(r);
  }
  async refresh(token: string, ip: string) {
    if (!/^[A-Za-z0-9_-]{64}$/.test(token)) throw invalid();
    const r = await this.storage(() =>
      this.repository.transaction<AuthResult>(async (tx) => {
        if (
          !(await tx.attempt(
            this.bucket('refresh-ip', ip),
            this.settings.ipAttempts,
            this.settings.windowSeconds,
          ))
        ) {
          await tx.audit({ evento: 'REFRESH_LIMIT', resultado: 'DENY' });
          return { ok: false, limited: true };
        }
        const first = await tx.findRefresh(this.digest(token));
        if (!first) {
          await tx.audit({ evento: 'REFRESH_INVALID', resultado: 'DENY' });
          return { ok: false };
        }
        const session = await tx.lockSession(first.sesion_id);
        // Re-read after family lock: a concurrent winner may have consumed this token.
        const current = await tx.findRefresh(this.digest(token));
        if (!session || !current) return { ok: false };
        const now = await tx.now();
        if (current.consumido_en || current.revocado_en) {
          await tx.revoke(session.sesion_id, 'REPLAY', now);
          await tx.audit({
            evento: 'REFRESH_REPLAY',
            resultado: 'DENY',
            objetivo: session.usuario_id,
            sesion: session.sesion_id,
          });
          return { ok: false };
        }
        if (
          !this.valid(session, now) ||
          current.expira_en <= now ||
          !(await tx.userActive(session.usuario_id))
        ) {
          await tx.revoke(session.sesion_id, 'EXPIRED_OR_INACTIVE', now);
          await tx.audit({
            evento: 'REFRESH_EXPIRED',
            resultado: 'DENY',
            objetivo: session.usuario_id,
            sesion: session.sesion_id,
          });
          return { ok: false };
        }
        const idle = new Date(
          Math.min(
            session.expira_en.getTime(),
            now.getTime() + this.settings.idleSeconds * 1000,
          ),
        );
        await tx.touchSession(session.sesion_id, now, idle);
        const issued = await this.issue(
          tx,
          { ...session, inactiva_en: idle, ultima_actividad_en: now },
          current.token_id,
        );
        await tx.audit({
          evento: 'REFRESH_OK',
          resultado: 'ALLOW',
          actor: session.usuario_id,
          sesion: session.sesion_id,
        });
        return issued;
      }),
    );
    return this.response(r);
  }
  async verify(credential: string | undefined): Promise<Principal> {
    if (!this.settings.enabled) throw new IdentityUnavailableError();
    if (!credential || credential.length > 4096) throw invalid();
    const match =
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
        credential,
      );
    if (
      !match ||
      !match[1]!
        .split('.')
        .every(
          (segment) =>
            Buffer.from(segment, 'base64url').toString('base64url') === segment,
        )
    )
      throw invalid();
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(match[1]!, {
        secret: this.settings.secret,
        algorithms: ['HS256'],
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        clockTolerance: 0,
      });
    } catch {
      throw invalid();
    }
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      typeof payload.sid !== 'string' ||
      !isUUID(payload.sid) ||
      typeof payload.jti !== 'string' ||
      !isUUID(payload.jti) ||
      payload.token_use !== 'access' ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.iat) ||
      Number(payload.exp) <= Number(payload.iat) ||
      payload.iss !== this.settings.issuer ||
      payload.aud !== this.settings.audience ||
      Number(payload.exp) <= now ||
      Number(payload.iat) > now + 5 ||
      Number(payload.exp) - Number(payload.iat) > this.settings.accessSeconds
    )
      throw invalid();
    const principal = { usuarioId: payload.sub, sesionId: payload.sid };
    if (!(await this.storage(() => this.repository.activeSession(principal))))
      throw invalid();
    return principal;
  }
  async profile(p: Principal) {
    const assignments = await this.storage(() =>
      this.access.assignments(p.usuarioId),
    );
    return {
      usuarioId: p.usuarioId,
      sessionId: p.sesionId,
      provider: 'local',
      assignments: assignments.map((g) => ({
        scope: g.scope,
        kind: g.kind,
        permissions: g.permissions.filter((permission) =>
          assignmentAllows(g, g.scope, permission),
        ),
      })),
    };
  }
  async sessions(p: Principal) {
    const sessions = await this.storage(() =>
      this.repository.sessions(p.usuarioId),
    );
    return sessions.map((s) => ({
      sessionId: s.sesion_id,
      createdAt: s.creada_en,
      expiresAt: s.expira_en,
      idleExpiresAt: s.inactiva_en,
      revokedAt: s.revocada_en,
      current: s.sesion_id === p.sesionId,
    }));
  }
  async revoke(p: Principal, target: string, logout = false): Promise<void> {
    const found = await this.storage(() =>
      this.repository.transaction(async (tx) => {
        const s = await tx.lockSession(target);
        if (!s || s.usuario_id !== p.usuarioId) {
          await tx.audit({
            evento: 'SESSION_REVOKE_DENIED',
            resultado: 'DENY',
            actor: p.usuarioId,
          });
          return false;
        }
        await tx.revoke(
          target,
          logout ? 'LOGOUT' : 'USER_REVOKED',
          await tx.now(),
        );
        await tx.audit({
          evento: logout ? 'LOGOUT' : 'SESSION_REVOKED',
          resultado: 'ALLOW',
          actor: p.usuarioId,
          sesion: target,
        });
        return true;
      }),
    );
    if (!found) throw new NotFoundException('Sesión no disponible');
  }
  async authorize(
    p: Principal,
    permission: string,
    scope: Partial<OrganizationScope>,
    titularOnly = false,
  ): Promise<void> {
    const grants = await this.storage(() =>
      this.access.assignments(p.usuarioId),
    );
    const validScope =
      typeof scope.hospitalId === 'string' &&
      isUUID(scope.hospitalId) &&
      [scope.divisionId, scope.servicioId].every(
        (id) => id == null || isUUID(id),
      );
    const allowed =
      validScope &&
      (await this.storage(() => this.access.scopeExists(scope))) &&
      grants.some(
        (g) =>
          (!titularOnly || g.kind === 'TITULAR') &&
          assignmentAllows(g, scope, permission),
      );
    await this.storage(() =>
      this.repository.transaction((tx) =>
        tx.audit({
          evento: 'AUTHORIZATION',
          resultado: allowed ? 'ALLOW' : 'DENY',
          actor: p.usuarioId,
          sesion: p.sesionId,
          hospital: allowed ? scope.hospitalId : undefined,
          division: allowed ? (scope.divisionId ?? undefined) : undefined,
          servicio: allowed ? (scope.servicioId ?? undefined) : undefined,
        }),
      ),
    );
    if (!allowed) throw new ForbiddenException('Acceso denegado');
  }
}
