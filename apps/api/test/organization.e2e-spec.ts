import { Test } from '@nestjs/testing';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AppService } from '../src/app.service.js';
import { PG_POOL } from '../src/database/postgres.service.js';
import { IamSettings } from '../src/modules/iam/domain/iam-settings.js';
import { IamService } from '../src/modules/iam/application/iam.service.js';
import { OrganizationQueries } from '../src/modules/organizacion/application/organization-queries.js';
import { configureApp } from '../src/main.js';
import { iamFixture } from './fixtures/iam-mock.js';

describe('ORG HTTP estricto sin PostgreSQL', () => {
  it('401 sin sesión, 400 consulta inválida y contrato paginado', async () => {
    const f = iamFixture();
    const references = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      limit: 50,
      order: 'id:asc',
    }));
    const forbidden = vi.fn(() => {
      throw new Error('No real database');
    });
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query: forbidden, connect: forbidden, end: vi.fn() })
      .overrideProvider(AppService)
      .useFactory({ factory: () => new AppService() })
      .overrideProvider(IamSettings)
      .useValue(f.settings)
      .overrideProvider(IamService)
      .useValue(f.service)
      .overrideProvider(OrganizationQueries)
      .useValue({ listReferences: references })
      .compile();
    const app = fixture.createNestApplication();
    configureApp(app);
    await app.init();
    try {
      await request(app.getHttpServer()).get('/api/v1/hospitales').expect(401);
      const token = await f.service.login(
        'cuenta_ficticia',
        f.password,
        'local',
      );
      await request(app.getHttpServer())
        .get('/api/v1/hospitales?limit=101')
        .auth(token.accessToken, { type: 'bearer' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/hospitales?unexpected=true')
        .auth(token.accessToken, { type: 'bearer' })
        .expect(400);
      const r = await request(app.getHttpServer())
        .get('/api/v1/hospitales')
        .auth(token.accessToken, { type: 'bearer' })
        .expect(200);
      expect(r.body).toEqual({
        items: [],
        nextCursor: null,
        limit: 50,
        order: 'id:asc',
      });
      const spec = (
        await request(app.getHttpServer()).get('/docs/openapi.json').expect(200)
      ).body;
      expect(
        spec.components.schemas.OrganizationReferenceDto.properties.divisionId
          .type,
      ).toBe('string');
      expect(
        spec.components.schemas.OrganizationReferencePageDto.properties
          .nextCursor.type,
      ).toBe('string');
      expect(spec.components.schemas.SessionDto.properties.revokedAt.type).toBe(
        'string',
      );
      expect(forbidden).not.toHaveBeenCalled();
      expect(references).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
