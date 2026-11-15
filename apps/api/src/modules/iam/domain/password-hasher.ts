import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { IamSettings } from './iam-settings.js';

export class HashBusyError extends Error {
  constructor() {
    super('IAM_HASH_BUSY');
  }
}

@Injectable()
export class PasswordHasher {
  private active = 0;
  private dummy?: Promise<string>;
  constructor(private readonly settings: IamSettings) {}

  validatePolicy(password: string): void {
    const length = Array.from(password).length;
    if (
      length < this.settings.passwordMin ||
      length > this.settings.passwordMax ||
      Buffer.byteLength(password, 'utf8') > 1024 ||
      !password.trim() ||
      password.includes('\0')
    ) {
      throw new Error('PASSWORD_POLICY_REJECTED');
    }
  }
  private async derive(
    password: string,
    salt: Buffer,
    memory: number,
    passes: number,
  ): Promise<Buffer> {
    if (this.active >= this.settings.hashConcurrency) throw new HashBusyError();
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        argon2(
          'argon2id',
          {
            message: password,
            nonce: salt,
            memory,
            passes,
            parallelism: 1,
            tagLength: 32,
          },
          (error, key) =>
            error ? reject(new Error('ARGON2_UNAVAILABLE')) : resolve(key),
        );
      });
    } finally {
      this.active--;
    }
  }
  private async rawHash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await this.derive(
      password,
      salt,
      this.settings.memory,
      this.settings.passes,
    );
    return `$argon2id$v=19$m=${this.settings.memory},t=${this.settings.passes},p=1$${salt.toString('base64url').replace(/-/g, '+').replace(/_/g, '/')}$${hash.toString('base64').replace(/=+$/, '')}`;
  }
  async hash(password: string): Promise<string> {
    this.validatePolicy(password);
    return this.rawHash(password);
  }
  async verify(password: string, encoded: string | null): Promise<boolean> {
    if (Buffer.byteLength(password, 'utf8') > 1024 || password.includes('\0'))
      return false;
    if (!encoded) {
      this.dummy ??= this.rawHash(randomBytes(48).toString('base64url')).catch(
        (error) => {
          this.dummy = undefined;
          throw error;
        },
      );
      await this.verify(password, await this.dummy);
      return false;
    }
    const match =
      /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(
        encoded,
      );
    if (!match) return false;
    const memory = Number(match[1]),
      passes = Number(match[2]);
    if (memory < 19456 || memory > 65536 || passes < 2 || passes > 4)
      return false;
    const salt = Buffer.from(match[3]!, 'base64'),
      expected = Buffer.from(match[4]!, 'base64');
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await this.derive(password, salt, memory, passes);
    return timingSafeEqual(actual, expected);
  }
}
