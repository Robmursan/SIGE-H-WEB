import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresService } from '../../src/database/postgres.service.js';
import { AccessRepository } from '../../src/modules/iam/infrastructure/access.repository.js';
import {
  assignmentAllows,
  ORGANIZATION_CATALOG_PERMISSION,
} from '../../src/modules/iam/domain/access-policy.js';
import { OrganizationRepository } from '../../src/modules/organizacion/infrastructure/organization.repository.js';
import { parseOrganizationQuery } from '../../src/modules/organizacion/dto/organization-query.dto.js';

// No HTTP identity is injected. This suite tests real SQL/policy only, against
// explicitly preapproved QA fixtures; it never creates fixtures or changes roles.
const hA = '11111111-1111-4111-8111-111111111111';
const hB = '11111111-1111-4111-8111-111111111112';
const sA = '33333333-3333-4333-8333-000000000001';
const sOther = '33333333-3333-4333-8333-000000000002';
const user = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 3000,
  options: '-c default_transaction_read_only=on -c statement_timeout=3000',
});
const pg = new PostgresService(pool, new ConfigService({ DB_SCHEMA: 'sigeh' }));
const repository = new OrganizationRepository(pg);
const access = new AccessRepository(pg);

describe('B1 QA — SQL organizativo real en solo lectura (no ejecutado sin autorización)', () => {
  afterAll(async () => {
    await pool.end();
  });
  it('exige fixture explícito, no interpreta ausencia de datos como aislamiento correcto', async () => {
    const { rows } = await pool.query(
      'SELECT identificador FROM sigeh.usuarios WHERE usuario_id=$1',
      [user(1)],
    );
    expect(rows[0]?.identificador).toBe('qa-b1-service-a');
    const result = await repository.list(
      user(1),
      'servicios',
      parseOrganizationQuery({ hospitalId: hA }, 'servicios'),
    );
    expect(result.map((item) => item.id)).toEqual([sA]);
  });
  it('solo permite encabezados y subáreas del servicio propio', async () => {
    expect(
      (
        await repository.list(
          user(1),
          'hospitales',
          parseOrganizationQuery({}, 'hospitales'),
        )
      ).map((x) => x.id),
    ).toEqual([hA]);
    expect(
      (
        await repository.list(
          user(1),
          'divisiones',
          parseOrganizationQuery({ hospitalId: hA }, 'divisiones'),
        )
      ).length,
    ).toBe(1);
    expect(
      (
        await repository.list(
          user(1),
          'subareas',
          parseOrganizationQuery(
            { hospitalId: hA, servicioId: sA },
            'subareas',
          ),
        )
      ).length,
    ).toBe(1);
    expect(
      await repository.list(
        user(1),
        'subareas',
        parseOrganizationQuery(
          { hospitalId: hA, servicioId: sOther },
          'subareas',
        ),
      ),
    ).toEqual([]);
  });
  it.each([1, 3, 4, 5, 6])(
    'deniega hospital ajeno/vigencia/cuenta/grant inválido (fixture %s)',
    async (n) => {
      const hospitalId = n === 1 ? hB : hA;
      expect(
        await repository.list(
          user(n),
          'servicios',
          parseOrganizationQuery({ hospitalId }, 'servicios'),
        ),
      ).toEqual([]);
      const grants = await access.assignments(user(n));
      expect(
        grants.some((grant) =>
          assignmentAllows(
            grant,
            { hospitalId },
            ORGANIZATION_CATALOG_PERMISSION,
          ),
        ),
      ).toBe(false);
    },
  );
  it('reconsulta autorización entre llamadas, sin caché de permisos ni claims', async () => {
    const query = parseOrganizationQuery(
      { hospitalId: hA, servicioId: sOther },
      'servicios',
    );
    expect(await repository.list(user(1), 'servicios', query)).toEqual([]);
    const first = await repository.list(
      user(1),
      'servicios',
      parseOrganizationQuery({ hospitalId: hA, limit: 1 }, 'servicios'),
    );
    expect(first).toHaveLength(1);
    expect(
      await repository.list(
        user(1),
        'servicios',
        parseOrganizationQuery(
          { hospitalId: hA, cursor: first[0].id },
          'servicios',
        ),
      ),
    ).toEqual([]);
  });
});
