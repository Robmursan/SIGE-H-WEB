import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresService } from '../../database/postgres.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController (CU-OPS-01 / CU-OPS-02)', () => {
  let controller: HealthController;
  let mockPostgresService: {
    checkReadiness: ReturnType<typeof vi.fn>;
    getSchema: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPostgresService = {
      checkReadiness: vi.fn(),
      getSchema: vi.fn().mockReturnValue('sigeh'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PostgresService,
          useValue: mockPostgresService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('CU-OPS-01: getLiveness() retorna 200 ok sin consultar PostgreSQL', () => {
    const response = controller.getLiveness();

    expect(mockPostgresService.checkReadiness).not.toHaveBeenCalled();
    expect(response.status).toBe('ok');
    expect(response.service).toBe('sige-h-api');
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });

  it('CU-OPS-02: getReadiness() y getHealth() retornan 200 cuando PostgreSQL y esquema sigeh están disponibles', async () => {
    mockPostgresService.checkReadiness.mockResolvedValue({
      ok: true,
      schema: 'sigeh',
      schemaVerified: true,
      latencyMs: 2,
    });

    const readyResponse = await controller.getReadiness();
    const healthResponse = await controller.getHealth();

    expect(mockPostgresService.checkReadiness).toHaveBeenCalledTimes(2);
    expect(readyResponse.status).toBe('ok');
    expect(readyResponse.database).toEqual({
      status: 'up',
      schema: 'sigeh',
      schemaVerified: true,
      latencyMs: 2,
    });
    expect(healthResponse.status).toBe('ok');
  });

  it('CU-OPS-02: getReadiness() lanza 503 cuando el esquema sigeh no existe aunque SELECT 1 responda', async () => {
    mockPostgresService.checkReadiness.mockResolvedValue({
      ok: false,
      schema: 'sigeh',
      schemaVerified: false,
      latencyMs: 1,
    });

    await expect(controller.getReadiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('CU-OPS-02: getHealth() lanza ServiceUnavailableException (503) sanitizada cuando falla PostgreSQL', async () => {
    mockPostgresService.checkReadiness.mockRejectedValue(
      new Error(
        'connect ECONNREFUSED postgresql://sigeh_admin:SecretPass@127.0.0.1:5432/sigeh_db',
      ),
    );

    try {
      await controller.getHealth();
      expect.unreachable('Debió lanzar ServiceUnavailableException');
    } catch (err) {
      const exception = err as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      const body = exception.getResponse() as Record<string, unknown>;
      expect(body).toMatchObject({
        status: 'error',
        service: 'sige-h-api',
        database: {
          status: 'down',
          schema: 'sigeh',
          schemaVerified: false,
        },
        message: 'Base de datos PostgreSQL no disponible',
      });
      expect(JSON.stringify(body)).not.toContain('SecretPass');
    }
  });
});
