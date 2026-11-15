import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { iamFixture, USER, OTHER } from '../../../../test/fixtures/iam-mock.js';

const bearer = (token: string) => 'Bearer ' + token;
describe('IAM local: sesiones, tokens, concurrencia simulada y auditoría', () => {
  it('login/identidad/perfil/sesiones sin exponer material persistido', async () => {
    const f = iamFixture();
    const r = await f.service.login('cuenta_ficticia', f.password, 'ip-test');
    expect(await f.service.verify(bearer(r.accessToken))).toEqual({
      usuarioId: USER,
      sesionId: r.sessionId,
    });
    expect(r.expiresIn).toBeLessThanOrEqual(300);
    expect(r.refreshToken).toHaveLength(64);
    expect([...f.tokens.keys()]).not.toContain(r.refreshToken);
    const profile = await f.service.profile({
      usuarioId: USER,
      sesionId: r.sessionId,
    });
    const sessions = await f.service.sessions({
      usuarioId: USER,
      sesionId: r.sessionId,
    });
    const serialized = JSON.stringify({ profile, sessions, audits: f.audits });
    for (const secret of [
      r.accessToken,
      r.refreshToken,
      f.password,
      f.credential.password_hash,
    ])
      expect(serialized).not.toContain(secret);
  });
  it.each(['unknown', 'password', 'inactive', 'change', 'locked'])(
    'deniega genéricamente %s y conserva auditoría esperada',
    async (kind) => {
      const f = iamFixture();
      if (kind === 'password') f.passwords.verify.mockResolvedValue(false);
      if (kind === 'inactive') f.credential.activo = false;
      if (kind === 'change') f.credential.requiere_cambio = true;
      if (kind === 'locked')
        f.credential.bloqueada_hasta = new Date(Date.now() + 60000);
      await expect(
        f.service.login(
          kind === 'unknown' ? 'desconocido' : 'cuenta_ficticia',
          f.password,
          'ip-test',
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(f.sessions.size).toBe(0);
      expect(f.audits.at(-1)?.evento).toBe('LOGIN_INVALID');
    },
  );
  it('acota intentos persistidos también de cuentas inexistentes', async () => {
    const f = iamFixture();
    for (let i = 0; i < 5; i++)
      await expect(
        f.service.login('desconocido', f.password, 'ip-test'),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      f.service.login('desconocido', f.password, 'ip-test'),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.audits.at(-1)?.evento).toBe('LOGIN_LIMIT');
  });
  it('rota una vez; replay revoca familia y JWT ya emitidos', async () => {
    const f = iamFixture();
    const first = await f.service.login(
      'cuenta_ficticia',
      f.password,
      'ip-test',
    );
    f.operations.length = 0;
    const second = await f.service.refresh(first.refreshToken, 'ip-test');
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(f.operations.slice(0, 3)).toEqual(['find', 'lock', 'find']);
    expect(f.operations.indexOf('consume')).toBeLessThan(
      f.operations.indexOf('insert'),
    );
    await expect(
      f.service.refresh(first.refreshToken, 'ip-test'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      f.service.verify(bearer(second.accessToken)),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.audits.at(-1)?.evento).toBe('REFRESH_REPLAY');
  });
  it('dos renovaciones concurrentes: un ganador y replay que invalida la familia', async () => {
    const f = iamFixture();
    const first = await f.service.login(
      'cuenta_ficticia',
      f.password,
      'ip-test',
    );
    const results = await Promise.allSettled([
      f.service.refresh(first.refreshToken, 'ip-test'),
      f.service.refresh(first.refreshToken, 'ip-test'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(f.sessions.get(first.sessionId)?.revocada_en).not.toBeNull();
  });
  it.each(['absolute', 'idle', 'token', 'inactive'])(
    'deniega refresh %s',
    async (reason) => {
      const f = iamFixture();
      const r = await f.service.login('cuenta_ficticia', f.password, 'ip-test');
      const session = f.sessions.get(r.sessionId)!;
      if (reason === 'absolute') session.expira_en = new Date(0);
      if (reason === 'idle') session.inactiva_en = new Date(0);
      if (reason === 'token')
        [...f.tokens.values()][0]!.expira_en = new Date(0);
      if (reason === 'inactive') f.credential.activo = false;
      await expect(
        f.service.refresh(r.refreshToken, 'ip-test'),
      ).rejects.toMatchObject({ status: 401 });
    },
  );
  it('logout/revocación propia y rechazo de sesión ajena sin filtrar propiedad', async () => {
    const f = iamFixture();
    const r = await f.service.login('cuenta_ficticia', f.password, 'ip-test');
    await expect(
      f.service.revoke(
        { usuarioId: OTHER, sesionId: randomUUID() },
        r.sessionId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await f.service.revoke(
      { usuarioId: USER, sesionId: r.sessionId },
      r.sessionId,
      true,
    );
    await expect(f.service.verify(bearer(r.accessToken))).rejects.toMatchObject(
      { status: 401 },
    );
  });
  it.each(['expired', 'audience', 'issuer', 'algorithm', 'no-exp', 'tampered'])(
    'rechaza JWT %s antes de autorización',
    async (kind) => {
      const f = iamFixture();
      const r = await f.service.login('cuenta_ficticia', f.password, 'ip-test');
      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = {
        sub: USER,
        sid: r.sessionId,
        jti: randomUUID(),
        token_use: 'access',
        iat: now,
      };
      if (kind === 'expired') {
        claims.iat = now - 300;
        claims.exp = now - 1;
      } else if (kind !== 'no-exp') {
        claims.exp = now + 300;
      }
      let token = await f.jwt.signAsync(claims, {
        secret: f.secret,
        algorithm: kind === 'algorithm' ? 'HS384' : 'HS256',
        issuer: kind === 'issuer' ? 'urn:wrong' : f.settings.issuer,
        audience: kind === 'audience' ? 'wrong' : f.settings.audience,
      });
      if (kind === 'tampered')
        token = token.slice(0, -1) + (token.endsWith('x') ? 'y' : 'x');
      await expect(f.service.verify(bearer(token))).rejects.toMatchObject({
        status: 401,
      });
      expect(f.repository.activeSession).not.toHaveBeenCalled();
    },
  );
  it('JWT correcto no basta cuando usuario/sesión están inactivos o revocados', async () => {
    const f = iamFixture();
    const r = await f.service.login('cuenta_ficticia', f.password, 'ip-test');
    f.credential.activo = false;
    await expect(f.service.verify(bearer(r.accessToken))).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      f.service.refresh(randomBytes(48).toString('base64url'), 'ip-test'),
    ).rejects.toMatchObject({ status: 401 });
  });
});
