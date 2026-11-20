// Reproducible export with a forbidden PG_POOL. No credentials, sockets or SQL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
for (const key of ['DB_PASSWORD', 'DATABASE_URL']) delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_USER: 'sigeh_qa_app',
  DB_NAME: 'sigeh_qa',
  DB_SCHEMA: 'sigeh',
  DB_PASSWORD_FILE: '/not-used/openapi-export/password',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  JWT_EXPIRATION: '15m',
  IAM_V2_ENABLED: 'false',
  L3A_READS_ENABLED: 'false',
  ASISTENCIA_ENABLED: 'false',
  SWAGGER_ENABLED: 'true',
});
Logger.overrideLogger(false);
const { AppModule } = await import('../dist/app.module.js');
const { PG_POOL } = await import('../dist/database/postgres.service.js');
const { createOpenApiDocument } = await import('../dist/main.js');
const forbidden = () => {
  throw new Error('OPENAPI_EXPORT_MUST_NOT_CONNECT_DATABASE');
};
let app;
try {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue({ query: forbidden, connect: forbidden, end: async () => {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  const spec = createOpenApiDocument(app);
  const qa = [
    '/api/v1/auth/login',
    '/api/v1/auth/me',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
    '/api/v1/auth/sessions',
    '/api/v1/auth/sessions/{sessionId}',
    '/api/v1/hospitales',
    '/api/v1/hospitales/{hospitalId}/divisiones',
    '/api/v1/servicios',
  ];
  const prepared = [
    '/api/v1/empleados',
    '/api/v1/empleados/{empleadoId}',
    '/api/v1/contratos/{contratoId}/adscripciones',
    '/api/v1/programaciones',
    '/api/v1/tableros/coordinacion',
  ];
  const evidencePath = root + '/artifacts/permissions/l3b2a-resultado.json';
  const evidence = fs.existsSync(evidencePath)
    ? JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
    : undefined;
  const readsTested =
    evidence?.status === 'PASS' &&
    evidence?.cleanup === 'complete_except_three_unassigned_catalog_entries' &&
    prepared.every((route) => evidence.tested_paths?.includes(route)) &&
    Object.keys(evidence.source_sha256 ?? {}).length === 8 &&
    Object.entries(evidence.source_sha256).every(
      ([file, hash]) =>
        createHash('sha256')
          .update(fs.readFileSync(path.join(root, file)))
          .digest('hex') === hash,
    );
  const ids = new Set();
  for (const [route, methods] of Object.entries(spec.paths))
    for (const [method, op] of Object.entries(methods)) {
      if (
        ![
          'get',
          'post',
          'put',
          'patch',
          'delete',
          'options',
          'head',
          'trace',
        ].includes(method)
      )
        continue;
      if (!op.operationId || ids.has(op.operationId))
        throw Error('OPENAPI_OPERATION_ID_INVALID');
      ids.add(op.operationId);
      const attendance =
        route === '/api/v1/pases-lista' ||
        route === '/api/v1/programaciones/{programacionId}/asistencia';
      op['x-sigeh-status'] = attendance
        ? 'local-mock-tested-disabled-awaiting-ephemeral-validation'
        : prepared.includes(route)
          ? readsTested
            ? 'qa-tested-disabled-by-default'
            : 'prepared-disabled-awaiting-qa-functional-validation'
          : qa.includes(route)
            ? 'qa-tested-disabled-by-default'
            : 'local-tested';
      if (attendance) {
        op['x-sigeh-sql-privileges'] =
          'not-authorized-awaiting-ephemeral-package';
        op['x-sigeh-functional-validation'] =
          'local-mocks-only-no-postgresql-execution';
      }
      if (prepared.includes(route)) {
        op['x-sigeh-sql-privileges'] = 'qa-column-select-verified-l3b1';
        op['x-sigeh-functional-validation'] = readsTested
          ? 'real-qa-l3b2a-synthetic-fixtures'
          : 'not-currently-verified';
        if (readsTested)
          op['x-sigeh-validation-evidence'] =
            'artifacts/permissions/l3b2a-resultado.json';
      }
      if (route.includes('hospitales') || route.endsWith('/servicios'))
        op['x-sigeh-projection'] = 'identifiers-hierarchy-active-only';
    }
  spec['x-sigeh-deployment'] =
    'ASISTENCIA, IAM, ORG and L3A reads disabled by default; temporary QA activation only; synthetic users cleaned; column SELECT grants verified in L3B-1';
  spec['x-sigeh-pending-resources'] = [
    {
      resource: 'asistencia operativa',
      reason:
        'Ephemeral environment, SQL privileges and real PostgreSQL write validation await authorization',
    },
    {
      resource: 'descriptive organization fields',
      reason: 'SQL column privileges not authorized',
    },
    {
      resource: 'personal and adscripciones',
      reason:
        'Read facultades absent in QA; synthetic functional validation blocked',
    },
    {
      resource: 'programacion and operational dashboard',
      reason:
        'Read facultades absent in QA; synthetic functional validation blocked',
    },
    {
      resource: 'incidencias, cobertura, disponibilidad',
      reason: 'SQL privileges and applicable business rules pending',
    },
  ].filter(
    (entry) =>
      !readsTested ||
      ![
        'personal and adscripciones',
        'programacion and operational dashboard',
      ].includes(entry.resource),
  );
  const resolveRef = (ref) =>
    ref
      .slice(2)
      .split('/')
      .reduce(
        (obj, k) => obj?.[k.replace(/~1/g, '/').replace(/~0/g, '~')],
        spec,
      );
  const walk = (obj) => {
    if (obj && typeof obj === 'object') {
      if (
        '$ref' in obj &&
        (!obj.$ref.startsWith('#/') || !resolveRef(obj.$ref))
      )
        throw Error('OPENAPI_REFERENCE_INVALID');
      for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(spec);
  if (!spec.openapi.startsWith('3.0.') || Object.keys(spec.paths).length !== 21)
    throw Error('OPENAPI_CONTRACT_INVALID');
  if (ids.size !== 21) throw Error('OPENAPI_OPERATION_COUNT_INVALID');
  for (const route of prepared) {
    const op = spec.paths[route].get;
    for (const code of [
      '400',
      '401',
      '403',
      '503',
      ...(route.endsWith('{empleadoId}') ? ['404'] : []),
    ])
      if (
        op.responses[code]?.content?.['application/json']?.schema?.$ref !==
        '#/components/schemas/ReadHttpErrorDto'
      )
        throw Error('OPENAPI_READ_ERROR_SCHEMA_INVALID');
    for (const param of op.parameters ?? [])
      if (param.in === 'path' && param.schema?.format !== 'uuid')
        throw Error('OPENAPI_READ_PATH_UUID_INVALID');
  }
  const expectedOperations = {
    'GET /api/v1': 'AppController_getHello',
    'GET /api/v1/health/live': 'getHealthLive',
    'GET /api/v1/health/ready': 'getHealthReady',
    'GET /api/v1/health': 'getHealth',
    'POST /api/v1/auth/login': 'iamLogin',
    'POST /api/v1/auth/refresh': 'iamRefresh',
    'GET /api/v1/auth/me': 'iamMe',
    'POST /api/v1/auth/logout': 'iamLogout',
    'GET /api/v1/auth/sessions': 'iamSessions',
    'DELETE /api/v1/auth/sessions/{sessionId}': 'iamRevokeSession',
    'GET /api/v1/hospitales': 'listAuthorizedHospitals',
    'GET /api/v1/hospitales/{hospitalId}/divisiones': 'listAuthorizedDivisions',
    'GET /api/v1/servicios': 'listAuthorizedServices',
    'GET /api/v1/empleados': 'listScopedStaff',
    'GET /api/v1/empleados/{empleadoId}': 'getScopedEmployee',
    'GET /api/v1/contratos/{contratoId}/adscripciones': 'listScopedAssignments',
    'GET /api/v1/programaciones': 'listScopedWeeklyProgramming',
    'GET /api/v1/tableros/coordinacion': 'getScopedProgrammingIndicators',
    'GET /api/v1/meta/version': 'getApiContractVersion',
    'GET /api/v1/pases-lista': 'listScopedAttendanceRoster',
    'PUT /api/v1/programaciones/{programacionId}/asistencia':
      'captureInitialAttendance',
  };
  const observedOperations = Object.fromEntries(
    Object.entries(spec.paths).flatMap(([route, methods]) =>
      Object.entries(methods)
        .filter(([method]) =>
          [
            'get',
            'post',
            'put',
            'delete',
            'patch',
            'head',
            'options',
            'trace',
          ].includes(method),
        )
        .map(([method, op]) => [
          method.toUpperCase() + ' ' + route,
          op.operationId,
        ]),
    ),
  );
  if (
    JSON.stringify(Object.entries(expectedOperations).sort()) !==
    JSON.stringify(Object.entries(observedOperations).sort())
  )
    throw Error('OPENAPI_OPERATION_IDS_CHANGED');
  const errorMatrix = {
    'POST /api/v1/auth/login': ['400', '401', '429', '503'],
    'POST /api/v1/auth/refresh': ['400', '401', '429', '503'],
    'GET /api/v1/auth/me': ['401', '503'],
    'POST /api/v1/auth/logout': ['401', '404', '503'],
    'GET /api/v1/auth/sessions': ['401', '503'],
    'DELETE /api/v1/auth/sessions/{sessionId}': ['400', '401', '404', '503'],
    'GET /api/v1/hospitales': ['400', '401', '403', '503'],
    'GET /api/v1/hospitales/{hospitalId}/divisiones': [
      '400',
      '401',
      '403',
      '503',
    ],
    'GET /api/v1/servicios': ['400', '401', '403', '503'],
  };
  for (const [identity, codes] of Object.entries(errorMatrix)) {
    const [method, route] = identity.split(' '),
      op = spec.paths[route][method.toLowerCase()];
    const actual = Object.keys(op.responses)
      .filter((code) => Number(code) >= 400)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(codes.slice().sort()))
      throw Error('OPENAPI_IAM_ORG_ERROR_CODES_INVALID');
    for (const code of codes) {
      const expected =
        '#/components/schemas/' +
        (code === '429' ? 'IamRateLimitErrorDto' : 'ReadHttpErrorDto');
      if (
        op.responses[code]?.content?.['application/json']?.schema?.$ref !==
        expected
      )
        throw Error('OPENAPI_IAM_ORG_ERROR_SCHEMA_INVALID');
    }
  }
  const queryMatrix = {
    '/api/v1/hospitales': ['hospitalId', 'cursor', 'limit'],
    '/api/v1/hospitales/{hospitalId}/divisiones': [
      'hospitalId',
      'divisionId',
      'cursor',
      'limit',
    ],
    '/api/v1/servicios': [
      'hospitalId',
      'divisionId',
      'servicioId',
      'cursor',
      'limit',
    ],
  };
  for (const [route, names] of Object.entries(queryMatrix)) {
    const params = spec.paths[route].get.parameters.filter(
      (p) => p.in === 'query',
    );
    if (
      JSON.stringify(params.map((p) => p.name).sort()) !==
      JSON.stringify(names.slice().sort())
    )
      throw Error('OPENAPI_ORG_QUERY_NAMES_INVALID');
    for (const p of params) {
      if (
        p.required !==
        (route === '/api/v1/servicios' && p.name === 'hospitalId')
      )
        throw Error('OPENAPI_ORG_QUERY_REQUIRED_INVALID');
      if (p.name === 'limit') {
        if (
          p.schema.type !== 'integer' ||
          p.schema.minimum !== 1 ||
          p.schema.maximum !== 100 ||
          p.schema.default !== 50
        )
          throw Error('OPENAPI_ORG_PAGINATION_INVALID');
      } else if (p.schema.type !== 'string' || p.schema.format !== 'uuid')
        throw Error('OPENAPI_ORG_QUERY_UUID_INVALID');
    }
  }
  for (const [route, method, name] of [
    ['/api/v1/auth/sessions/{sessionId}', 'delete', 'sessionId'],
    ['/api/v1/hospitales/{hospitalId}/divisiones', 'get', 'hospitalId'],
  ]) {
    const p = spec.paths[route][method].parameters.find(
      (p) => p.in === 'path' && p.name === name,
    );
    if (
      !p ||
      !p.required ||
      p.schema.type !== 'string' ||
      p.schema.format !== 'uuid'
    )
      throw Error('OPENAPI_IAM_ORG_PATH_UUID_INVALID');
  }
  const standard = spec.components.schemas.ReadHttpErrorDto,
    limited = spec.components.schemas.IamRateLimitErrorDto;
  if (
    JSON.stringify(standard.required?.slice().sort()) !==
      JSON.stringify(['error', 'message', 'statusCode']) ||
    standard.properties.statusCode.type !== 'integer' ||
    standard.properties.error.type !== 'string' ||
    JSON.stringify(standard.properties.message.oneOf) !==
      JSON.stringify([
        { type: 'string' },
        { type: 'array', items: { type: 'string' } },
      ]) ||
    standard.properties.message.type
  )
    throw Error('OPENAPI_STANDARD_ERROR_BODY_INVALID');
  if (
    JSON.stringify(limited.required?.slice().sort()) !==
      JSON.stringify(['message', 'statusCode']) ||
    limited.properties.error ||
    limited.properties.statusCode.type !== 'integer' ||
    limited.properties.message.type !== 'string'
  )
    throw Error('OPENAPI_RATE_LIMIT_BODY_INVALID');
  for (const [route, method] of [
    ['/api/v1/pases-lista', 'get'],
    ['/api/v1/programaciones/{programacionId}/asistencia', 'put'],
  ]) {
    const op = spec.paths[route][method];
    for (const code of [
      '400',
      '401',
      '403',
      '404',
      '503',
      ...(method === 'put' ? ['409'] : []),
    ])
      if (
        op.responses[code]?.content?.['application/json']?.schema?.$ref !==
        '#/components/schemas/ReadHttpErrorDto'
      )
        throw Error('OPENAPI_ATTENDANCE_ERROR_INVALID');
    if (method === 'put') {
      for (const name of ['programacionId', 'Idempotency-Key'])
        if (
          !op.parameters.some(
            (p) => p.name === name && p.required && p.schema?.format === 'uuid',
          )
        )
          throw Error('OPENAPI_ATTENDANCE_UUID_INVALID');
    } else if (
      JSON.stringify(op.parameters.map((p) => p.name).sort()) !==
      JSON.stringify(
        [
          'hospitalId',
          'servicioId',
          'fecha',
          'horarioId',
          'cursor',
          'limit',
        ].sort(),
      )
    )
      throw Error('OPENAPI_ATTENDANCE_QUERY_INVALID');
  }
  const output = root + '/artifacts/openapi/sigeh-v1.json';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(spec, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: 'PASS',
      paths: Object.keys(spec.paths).length,
      operations: ids.size,
      refs: 'resolved',
      sql_queries: 0,
      output: 'artifacts/openapi/sigeh-v1.json',
    }),
  );
} finally {
  if (app) await app.close();
  delete process.env.JWT_SECRET;
}
