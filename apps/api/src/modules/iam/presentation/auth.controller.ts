import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Request } from 'express';
import { ReadHttpErrorDto } from '../../lecturas/read-error.dto.js';
import { IamService } from '../application/iam.service.js';
import { type Principal } from '../domain/session-model.js';
import {
  CurrentPrincipal,
  IamAvailabilityGuard,
  SessionGuard,
} from './iam.guards.js';
import {
  LoginDto,
  RefreshDto,
  TokensDto,
  ProfileDto,
  SessionDto,
  IamRateLimitErrorDto,
} from './auth.dto.js';

@ApiTags('IAM')
@ApiUnauthorizedResponse({
  description: 'Credencial o sesión inválida',
  type: ReadHttpErrorDto,
})
@ApiServiceUnavailableResponse({
  type: ReadHttpErrorDto,
  description: 'IAM deshabilitado o persistencia no disponible',
})
@UseGuards(IamAvailabilityGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly iam: IamService) {}
  @Post('login')
  @ApiBadRequestResponse({
    description: 'Entrada inválida, sin datos sensibles',
    type: ReadHttpErrorDto,
  })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'iamLogin',
    summary: 'Autenticación local y sesión persistente',
  })
  @ApiOkResponse({ type: TokensDto })
  @ApiTooManyRequestsResponse({
    type: IamRateLimitErrorDto,
    description: 'Límite persistente de intentos o capacidad KDF',
  })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.iam.login(
      dto.identificador,
      dto.password,
      request.ip ?? 'unknown',
    );
  }
  @Post('refresh')
  @ApiBadRequestResponse({
    description: 'Entrada inválida, sin datos sensibles',
    type: ReadHttpErrorDto,
  })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'iamRefresh',
    summary: 'Rotar refresh opaco; replay revoca familia',
  })
  @ApiOkResponse({ type: TokensDto })
  @ApiTooManyRequestsResponse({
    description: 'Límite persistente',
    type: IamRateLimitErrorDto,
  })
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.iam.refresh(dto.refreshToken, request.ip ?? 'unknown');
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'iamMe',
    summary: 'Perfil y facultades explícitas vigentes',
  })
  @ApiOkResponse({ type: ProfileDto })
  me(@CurrentPrincipal() p: Principal) {
    return this.iam.profile(p);
  }
  @Post('logout')
  @ApiNotFoundResponse({
    description: 'Sesión no disponible al revocar',
    type: ReadHttpErrorDto,
  })
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'iamLogout',
    summary: 'Revocar la sesión actual',
  })
  @ApiNoContentResponse()
  logout(@CurrentPrincipal() p: Principal) {
    return this.iam.revoke(p, p.sesionId, true);
  }
  @Get('sessions')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'iamSessions',
    summary: 'Últimas 50 sesiones propias, sin tokens',
  })
  @ApiOkResponse({ type: SessionDto, isArray: true })
  sessions(@CurrentPrincipal() p: Principal) {
    return this.iam.sessions(p);
  }
  @Delete('sessions/:sessionId')
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @ApiBadRequestResponse({
    description: 'Entrada inválida, sin datos sensibles',
    type: ReadHttpErrorDto,
  })
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'iamRevokeSession',
    summary: 'Revocar una sesión propia',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    description: 'Sesión no disponible para el actor',
    type: ReadHttpErrorDto,
  })
  revoke(
    @CurrentPrincipal() p: Principal,
    @Param('sessionId', new ParseUUIDPipe()) id: string,
  ) {
    return this.iam.revoke(p, id);
  }
}
