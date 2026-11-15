import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { IamSettings } from './iam-settings.js';
import { HashBusyError, PasswordHasher } from './password-hasher.js';

const settings = (extra = {}) => new IamSettings(new ConfigService(extra));
describe('Argon2id y configuración IAM, solo local', () => {
  it('genera PHC Argon2id con parámetros explícitos, sal aleatoria y verificación segura', async () => {
    const p = new PasswordHasher(settings());
    const secret = randomBytes(24).toString('base64url');
    const first = await p.hash(secret),
      second = await p.hash(secret);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(secret);
    expect(await p.verify(secret, first)).toBe(true);
    expect(await p.verify(randomBytes(24).toString('base64url'), first)).toBe(
      false,
    );
    expect(await p.verify(secret, null)).toBe(false);
  });
  it.each(['', ' ', 'short', 'x'.repeat(1025)])(
    'rechaza política inválida sin eco de entrada (%#)',
    async (input) => {
      await expect(new PasswordHasher(settings()).hash(input)).rejects.toThrow(
        'PASSWORD_POLICY_REJECTED',
      );
    },
  );
  it('acota hashes malformados/costos y capacidad concurrente', async () => {
    const p = new PasswordHasher(settings({ IAM_HASH_CONCURRENCY: 1 }));
    expect(
      await p.verify(
        'input',
        '$argon2id$v=19$m=999999999,t=2,p=1$invalid$invalid',
      ),
    ).toBe(false);
    const pending = p.hash(randomBytes(32).toString('base64url'));
    await expect(
      p.hash(randomBytes(32).toString('base64url')),
    ).rejects.toBeInstanceOf(HashBusyError);
    await pending;
  });
  it.each([
    { IAM_V2_ENABLED: 'invalid' },
    { IAM_ACCESS_SECONDS: 86400 },
    { IAM_ARGON_MEMORY_KIB: 1024 },
    { IAM_ARGON_PASSES: 1 },
    { IAM_HASH_CONCURRENCY: 99 },
    { IAM_IDLE_SECONDS: 86400, IAM_ABSOLUTE_SECONDS: 900 },
    { IAM_V2_ENABLED: 'true' },
  ])('deniega configuración inválida (%#)', (extra) => {
    expect(() => settings(extra)).toThrow('IAM_CONFIGURATION_INVALID');
  });
});
