import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresService } from '../../database/postgres.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPostgresService: {
    ping: ReturnType<typeof vi.fn>;
    getSchema: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPostgresService = {
      ping: vi.fn(),
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

  it('retorna 200 (status ok) cuando SELECT 1 responde satisfactoriamente', async () => {
    mockPostgresService.ping.mockResolvedValue({
      ok: true,
      schema: 'sigeh',
      latencyMs: 3,
    });

    const response = await controller.getHealth();

    expect(mockPostgresService.ping).toHaveBeenCalledTimes(1);
    expect(response.status).toBe('ok');
    expect(response.service).toBe('sige-h-api');
    expect(response.database).toEqual({
      status: 'up',
      schema: 'sigeh',
      latencyMs: 3,
    });
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });

  it('lanza ServiceUnavailableException (503) sanitizada cuando falla SELECT 1', async () => {
    mockPostgresService.ping.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
    );

    await expect(controller.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );

    try {
      await controller.getHealth();
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
        },
        message: 'Base de datos PostgreSQL no disponible',
      });
    }
  });
});
