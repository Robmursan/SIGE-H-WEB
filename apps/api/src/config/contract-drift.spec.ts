import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT_OPERATIONS } from './contract-operations.js';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const read = (p: string) =>
  JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const normalize = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(normalize)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.entries(x)
            .filter(([k]) => !k.startsWith('x-sigeh-'))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, normalize(v)]),
        )
      : x;
describe('contrato canónico versionado, no PostgreSQL', () => {
  it('manifiesto y registro explícito detectan drift de bytes y operaciones', () => {
    const file = 'artifacts/openapi/sigeh-v1.json';
    const s = read(file),
      m = read('artifacts/openapi/sigeh-v1.manifest.json');
    expect(
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex'),
    ).toBe(m.sha256);
    expect(m.operations).toEqual(CONTRACT_OPERATIONS);
    const ops = Object.fromEntries(
      Object.entries(s.paths).flatMap(([p, item]) =>
        Object.entries(item as Record<string, { operationId: string }>)
          .filter(([method]) =>
            [
              'get',
              'post',
              'put',
              'patch',
              'delete',
              'options',
              'head',
              'trace',
            ].includes(method),
          )
          .map(([method, o]) => [
            method.toUpperCase() + ' ' + p,
            o.operationId,
          ]),
      ),
    );
    expect(ops).toEqual(CONTRACT_OPERATIONS);
  });
  it('preserva las 33 operaciones anteriores salvo corrección aprobada de limit', () => {
    const before = read('artifacts/openapi/history/e2e-mvp-01-base-33.json'),
      after = read('artifacts/openapi/sigeh-v1.json');
    let count = 0;
    for (const [p, item] of Object.entries(before.paths))
      for (const [method, op] of Object.entries(
        item as Record<string, unknown>,
      )) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method))
          continue;
        count++;
        const old = structuredClone(op) as {
          parameters?: { name: string; schema: unknown }[];
        };
        const next = structuredClone(after.paths[p][method]);
        if (
          p === '/api/v1/servicios/{servicioId}/subareas' &&
          method === 'get'
        ) {
          old.parameters!.find((p) => p.name === 'limit')!.schema =
            next.parameters.find(
              (p: { name: string }) => p.name === 'limit',
            ).schema;
        }
        expect(normalize(next)).toEqual(normalize(old));
      }
    expect(count).toBe(33);
  });
  it('limit es integer y no Object; nuevas rutas jamás publican por defecto', () => {
    const s = read('artifacts/openapi/sigeh-v1.json');
    const limit = s.paths[
      '/api/v1/servicios/{servicioId}/subareas'
    ].get.parameters.find((p: { name: string }) => p.name === 'limit').schema;
    expect(limit).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
    });
    expect(
      s.paths['/api/v1/programaciones/generar'].post['x-sigeh-default-enabled'],
    ).toBe(false);
  });
});

describe('compatibilidad aditiva de schemas y subconjunto original de 21', () => {
  it('conserva propiedades/requeridos previos; solo agrega datos opcionales y corrige Object de limit', () => {
    const baselinePath = 'artifacts/openapi/history/e2e-mvp-01-base-33.json';
    const before = read(baselinePath),
      after = read('artifacts/openapi/sigeh-v1.json');
    expect(
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, baselinePath)))
        .digest('hex'),
    ).toBe('07dbf25606dc47595ab9a3cc84284b761b6256064238338172e074c0a193dde5');
    for (const [name, schema] of Object.entries(before.components.schemas) as [
      string,
      {
        properties?: Record<string, unknown>;
        required?: string[];
        type?: string;
      },
    ][]) {
      if (name === 'Object' && !after.components.schemas[name]) continue;
      const next = after.components.schemas[name];
      expect(next.type).toBe(schema.type);
      for (const [key, value] of Object.entries(schema.properties ?? {}))
        expect(next.properties[key]).toEqual(value);
      expect(next.required).toEqual(schema.required);
    }
    const original = Object.values(before.paths)
      .flatMap((p) =>
        Object.values(p as Record<string, { operationId: string }>),
      )
      .filter(
        (o) =>
          !/^(getAdmin|listAdmin|createAdmin|updateAdmin|simulateServiceTomorrow)/.test(
            o.operationId,
          ),
      );
    expect(original).toHaveLength(21);
    const currentIds = new Set(Object.values(CONTRACT_OPERATIONS));
    for (const o of original)
      expect(currentIds.has(o.operationId as never)).toBe(true);
  });
});

describe('baseline E2E-MVP-01 de 47 operaciones', () => {
  it('conserva íntegramente las operaciones y esquemas existentes', () => {
    const file = 'artifacts/openapi/history/e2e-mvp-02-base-47.json';
    expect(
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex'),
    ).toBe('f272e23b8acccde37f8ff5557a6a6126e38d3faa112cbf5f4892a3d4f4d3a689');
    const before = read(file),
      after = read('artifacts/openapi/sigeh-v1.json');
    let count = 0;
    for (const [route, item] of Object.entries(before.paths))
      for (const [method, operation] of Object.entries(
        item as Record<string, unknown>,
      )) {
        expect(normalize(after.paths[route][method])).toEqual(
          normalize(operation),
        );
        count++;
      }
    expect(count).toBe(47);
    for (const [key, schema] of Object.entries(before.components.schemas))
      expect(after.components.schemas[key]).toEqual(schema);
  });
});
