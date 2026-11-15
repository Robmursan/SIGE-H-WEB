import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isInsecureJwtSecret } from '../../../config/env.validation.js';

@Injectable()
export class IamSettings {
  readonly enabled: boolean;
  readonly issuer: string;
  readonly audience: string;
  readonly secret: string;
  readonly accessSeconds: number;
  readonly absoluteSeconds: number;
  readonly idleSeconds: number;
  readonly accountAttempts: number;
  readonly ipAttempts: number;
  readonly windowSeconds: number;
  readonly passwordMin: number;
  readonly passwordMax: number;
  readonly memory: number;
  readonly passes: number;
  readonly hashConcurrency: number;

  constructor(config: ConfigService) {
    const flag = config.get<string>('IAM_V2_ENABLED', 'false');
    if (!['true', 'false'].includes(flag))
      throw new Error('IAM_CONFIGURATION_INVALID');
    this.enabled = flag === 'true';
    const bounded = (
      name: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const value = Number(config.get(name, fallback));
      if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new Error('IAM_CONFIGURATION_INVALID');
      return value;
    };
    this.issuer = config.get<string>('IAM_JWT_ISSUER', '');
    this.audience = config.get<string>('IAM_JWT_AUDIENCE', '');
    this.secret = config.get<string>('JWT_SECRET', '');
    this.accessSeconds = bounded('IAM_ACCESS_SECONDS', 300, 60, 900);
    this.absoluteSeconds = bounded('IAM_ABSOLUTE_SECONDS', 28800, 900, 86400);
    this.idleSeconds = bounded('IAM_IDLE_SECONDS', 1800, 300, 86400);
    this.accountAttempts = bounded('IAM_ACCOUNT_ATTEMPTS', 5, 2, 20);
    this.ipAttempts = bounded('IAM_IP_ATTEMPTS', 30, 5, 120);
    this.windowSeconds = bounded('IAM_ATTEMPT_WINDOW_SECONDS', 900, 60, 3600);
    this.passwordMin = bounded('IAM_PASSWORD_MIN_LENGTH', 12, 12, 64);
    this.passwordMax = bounded('IAM_PASSWORD_MAX_LENGTH', 128, 64, 1024);
    this.memory = bounded('IAM_ARGON_MEMORY_KIB', 19456, 19456, 65536);
    this.passes = bounded('IAM_ARGON_PASSES', 2, 2, 4);
    this.hashConcurrency = bounded('IAM_HASH_CONCURRENCY', 2, 1, 4);
    if (
      this.idleSeconds > this.absoluteSeconds ||
      this.passwordMax < this.passwordMin ||
      (this.enabled &&
        (isInsecureJwtSecret(this.secret) ||
          !/^(?:https?:\/\/[^\s]+|urn:[^\s]+)$/.test(this.issuer) ||
          !this.audience.trim() ||
          this.audience !== this.audience.trim() ||
          this.issuer.length > 200 ||
          this.audience.length > 200))
    ) {
      throw new Error('IAM_CONFIGURATION_INVALID');
    }
  }
}
