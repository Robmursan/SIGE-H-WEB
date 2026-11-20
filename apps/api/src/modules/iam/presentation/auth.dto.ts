import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({ maxLength: 100, example: 'cuenta_ficticia' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^(?!.*\p{Cc})\S(?:.*\S)?$/u)
  identificador!: string;
  @ApiProperty({ writeOnly: true, maxLength: 1024 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
export class RefreshDto {
  @ApiProperty({ writeOnly: true, minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{64}$/)
  refreshToken!: string;
}
export class TokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ enum: ['Bearer'] }) tokenType!: string;
  @ApiProperty({ example: 300 }) expiresIn!: number;
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
}
export class ProfileDto {
  @ApiProperty({ format: 'uuid' }) usuarioId!: string;
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
  @ApiProperty({ enum: ['local'] }) provider!: string;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          nullable: true,
          enum: ['TITULAR', 'ENCARGADO'],
        },
        scope: {
          type: 'object',
          properties: {
            hospitalId: { type: 'string', format: 'uuid' },
            divisionId: { type: 'string', format: 'uuid', nullable: true },
            servicioId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  assignments!: unknown[];
}
export class SessionDto {
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ format: 'date-time' }) idleExpiresAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: Date | null;
  @ApiProperty() current!: boolean;
}

// The implemented 429 uses HttpException(string, 429), not a built-in subclass.
// Nest therefore emits these two fields without an `error` label.
export class IamRateLimitErrorDto {
  @ApiProperty({ type: 'integer', enum: [429] }) statusCode!: number;
  @ApiProperty({ type: String }) message!: string;
}
