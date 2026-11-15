# D1 — implementación IAM V2

**PASS para preparación de código y pruebas locales; despliegue pendiente D2/D3.** Rama `feat/codex-b1-iam-org`, fecha local 2026-11-11. Se inspeccionaron estado Git, C2.2/C2.3, ADR-B1, DDL V1 externo, especificación CU-IAM-01..06, IAM/organización/Pool y propuestas V2. El trabajo C2.3 preexistente se conservó y extendió; no hubo conexión PostgreSQL, aprovisionamiento ni modificación de infraestructura en D1.

## Implementado

- Login local Argon2id asíncrono nativo, PHC v19, sal aleatoria 16 bytes, memoria 19456 KiB, dos pasadas, paralelismo 1, salida 32 bytes. Costos verificados y acotados; máximo dos KDF concurrentes por defecto. Sin dependencia nueva ni fallback bcrypt. Runtime declarado Node >=26, probado con el Node instalado. Referencias: [Node crypto](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback), [mínimos OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Política configurable: mínimo 12 y máximo 128 caracteres por defecto, límite UTF-8 1024 bytes; no se normaliza la contraseña. Hash/verificación solo en memoria; nunca logs de contraseña/hash. Sin usuarios predeterminados ni alta masiva.
- Protección persistente: cinco intentos por identificador y treinta por IP en 900 segundos por defecto; claves HMAC, sin almacenar identificador/IP en claro en los buckets. También contadores/bloqueo de credencial. Auditoría de login, límites, refresh, revocación y decisiones de autorización. Fallos esperados confirman contador/auditoría antes del 401/429; errores internos devuelven 503 genérico.
- Sesiones PostgreSQL; access JWT HS256 de hasta 300 segundos, emisor/audiencia explícitos, exp/iat/jti/sub/sid requeridos, validación criptográfica y rechazo de codificación no canónica. Cada petición protegida vuelve a comprobar sesión/usuario activo, revocación y expiraciones. No se confía en permisos de claims.
- Refresh opaco de 48 bytes aleatorios: solo SHA-256 persistido. Rotación de un uso, lock de familia, relectura del token tras lock, consumo antes de insertar reemplazo. Replay revoca la familia, incluidos los access JWT por su verificación de sesión. Duración absoluta ocho horas e inactividad treinta minutos por defecto; solo refresh renueva inactividad. No reintentar COMMIT incierto ni entregar tokens antes de COMMIT confirmado.
- Autorización con roles/permisos existentes, padres reales activos y vigencias. Contexto de mandato nuevo obligatorio: sin él se deniega. Encargado necesita fecha final y subconjunto explícito de permisos que también existan en su rol; nunca hereda facultades por ausencia del titular. Decoradores/guards exportados permiten exigir titular exclusivamente. Se auditan ALLOW/DENY; no se afirma RLS ni aislamiento hospitalario por ACL SQL.
- Se mantiene IdentityVerifier para proveedor OIDC futuro; no se implementaron issuer/JWKS externos ni vinculación automática. Guards son prechecks; futuros writes organizativos deberán revalidar ámbito dentro de su propia transacción. No se publican rutas organizativas nuevas.

## HTTP y activación

Todas bajo `/api/v1`; Cache-Control no-store en IAM:

| Método/ruta | operationId | Resultado funcional |
|---|---|---|
| POST /auth/login | iamLogin | 200 tokens; 400 entrada; 401 genérico; 429 límite |
| POST /auth/refresh | iamRefresh | 200 tokens rotados; 400/401/429 |
| GET /auth/me | iamMe | 200 perfil propio y facultades, sin hashes/tokens |
| POST /auth/logout | iamLogout | 204 revoca sesión actual |
| GET /auth/sessions | iamSessions | 200 últimas 50 sesiones propias, sin material de tokens |
| DELETE /auth/sessions/:sessionId | iamRevokeSession | 204 propia; 400 UUID inválido; 404 ajena/inexistente |

Protegidas requieren bearer y devuelven 401 inválido/expirado/revocado/inactivo. **IAM_V2_ENABLED=false por defecto**: las seis rutas están registradas y Swagger las describe, pero responden 503 antes de SQL. También 503 ante persistencia no disponible. Activación exige IAM_JWT_ISSUER, IAM_JWT_AUDIENCE y JWT_SECRET externo válido. El launcher QA admite las variables IAM validadas. No existe identidad ficticia ni bypass en runtime; los almacenes simulados están exclusivamente en tests.

Health/live/ready, raíz y meta/version conservan contrato. Swagger permanece `/docs`, OpenAPI `/docs/openapi.json` (URL habitual http://127.0.0.1:3000/docs cuando se arranque y configure). Las cinco rutas anteriores se conservan y se añaden seis paths IAM reales. No se arrancó un backend contra QA para comprobarlas.

## SQL canónico y ejecución futura

Los cuatro archivos nuevos en `infra/sql/migrations/` están preparados, **NO APLICADOS**:

1. `V2__iam_local.sql`: propietario autorizado QA/PG17, guardas V1 51 tablas/87 índices/261 constraints validadas/8 triggers y ausencia de V2 parcial. Crea siete tablas: usuario_credenciales, sesiones_usuario, refresh_tokens_sesion, iam_limites_acceso, auditoria_seguridad, usuario_roles_contexto y encargo_permisos. Conserva las 51 tablas originales; total esperado posterior 58, constraints totales aumentarán. No reimporta maestro ni siembra identidades.
2. `V2__iam_local.permisos-qa.sql`: transacción separada del propietario, rol seguro/sin membresías/ownership y baseline sin grants de datos. SELECT por columnas sobre ocho tablas IAM/jerarquía V1; no empleados ni datos de catálogo descriptivos innecesarios. V2: permisos de lectura, inserción y UPDATE por columnas para sesión/refresh/límites; credenciales solo lectura necesaria y actualización de intentos/bloqueo, nunca hash; auditoría solo INSERT. No DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, secuencias, EXECUTE nuevo, PUBLIC ni otras bases.
3. `V2__iam_local.verificacion.sql`: SELECT de estructura, ACL/columnas y positivas/negativas esperadas, sin hashes de credenciales ni filas hospitalarias.
4. `V2__iam_local.rollback.sql`: guardado por identidad QA, marcador de revisión de snapshot y pools cerrados; revoca solo la lista de grants D1. Conserva tablas/auditoría/tokens consumidos, CONNECT/USAGE C2.2 y PUBLIC. Sin DROP ni CASCADE. Exige revisar que no haya grants posteriores legítimos coincidentes; no es reversión automática de permisos preexistentes. Primero deshabilitar IAM y preservar evidencia.

Esta V2 **sustituye** las propuestas locales/sesiones antiguas; no aplicarlas además. La propuesta OIDC sigue futura. Usuarios enlazan empleados mediante la FK V1 existente, sin duplicar identidades; contexto referencia usuario_roles y sus relaciones organizativas existentes.

IAM usa transacciones explícitas BEGIN READ WRITE en el mismo cliente, conservando la comprobación de COMMIT de PostgresService. No se cambia el default read-only del rol ni su configuración. Antes de D2 los grants no existen; la bandera evita simular persistencia o resolver fallos concediendo permisos excesivos.

## Evidencia local y límites

| Comando desde apps/api | Resultado final |
|---|---|
| npm run build | PASS, exit 0 |
| npm run lint | PASS, exit 0, sin warnings |
| node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json | PASS, incluye pruebas en modo estricto |
| npm test | PASS: 125 pruebas, 12 archivos |
| npm run test:e2e | PASS: 24 pruebas HTTP, 3 archivos |
| python3 scripts/qa/d1-validar-migracion.py (raíz) | PASS: contrato estático SQL/grants/rollback y SHA maestro |
| git diff --check / revisión --no-index de nuevos archivos | PASS |

**149 pruebas automatizadas superadas.** Incluyen Argon2id real local, login válido/incorrecto/inactivo/bloqueado, límites, JWT expirado/alterado/audiencia/emisor/algoritmo/exp ausente, refresh rotado/expirado/replay, revocación propia/ajena, concurrencia simulada, guards, jerarquías hospital/división/servicio, mandato de encargado, DTO estrictos, errores genéricos sin secretos y contratos health/Swagger. Las salidas WARN/ERROR transaccionales de unitarias son mocks de pérdida de conexión/rollback, no eventos PostgreSQL.

Las pruebas HTTP sustituyen PG_POOL por tripwire y persistencia IAM por mocks; jamás conectan QA. La concurrencia se prueba con transacciones simuladas y orden SQL, **no prueba locks/índices/COMMIT reales PostgreSQL**. No se ejecutaron test:integration, test:qa:readonly, migración, grants, rollback ni consultas de verificación SQL. No hay parser PostgreSQL local verificado para DDL: revisión estática no equivale a ejecutar/validar constraints. La primera comprobación HTTP detectó una expectativa Swagger antigua; se actualizó a los paths autorizados y la ejecución final pasó.

## Archivos D1

Nuevos, relativos a `apps/api/src/modules/iam/`:

- `application/iam.service.ts`, `application/iam.service.spec.ts`.
- `domain/iam-settings.ts`, `domain/password-hasher.ts`, `domain/password-hasher.spec.ts`, `domain/session-model.ts`.
- `infrastructure/iam.repository.ts`, `infrastructure/iam.repository.spec.ts`.
- `presentation/auth.controller.ts`, `presentation/auth.dto.ts`, `presentation/iam.guards.ts`, `presentation/iam.guards.spec.ts`.

Actualizados en ese módulo: `iam.module.ts`, `domain/access-policy.ts`, `domain/access-policy.spec.ts`, `infrastructure/access.repository.ts`, `infrastructure/authorization-sql.ts`.

Además: `apps/api/src/database/postgres.service.ts` y `apps/api/src/database/postgres.service.spec.ts` (modos transaccionales y logs por código), `apps/api/test/fixtures/iam-mock.ts`, `apps/api/test/iam-v2.e2e-spec.ts` nuevos; actualizados `apps/api/test/iam-org-blocked.e2e-spec.ts`, `operaciones.e2e-spec.ts`, `setup-http.ts`, `qa-runtime.readonly.mjs`; `apps/api/scripts/start-qa.mjs`, `apps/api/.env.example`, `apps/api/package.json`, `apps/api/package-lock.json` (engine Node, sin instalar dependencias). SQL y archivos auxiliares: los cuatro anteriores, `scripts/qa/d1-validar-migracion.py`, ficha `docs/casos-uso/D1-IAM-V2.md` y este informe. El resto de cambios C2.3 ya estaba en el worktree antes de D1; Untitled no se abrió.

## Condiciones D2 y riesgos pendientes

Nueva autorización explícita de D2; confirmar destino/identidad/backup/owner/ACL y baseline V1 antes de aplicar DDL, después permisos y verificación. Capturar snapshot lógico de ACL por columna para rollback; detener ante V2 parcial o grants previos. No habilitar IAM por el mero hecho de aplicar tablas.

Se requieren: revisión institucional de política de contraseñas, mandatos/permisos de encargados y retención; enrolamiento seguro aprobado sin cuentas predeterminadas (requiere_cambio=true por defecto deniega login hasta alta/activación explícita); secreto JWT/issuer/audience externos y custodia; Node compatible; límites de capacidad/proxy confiable, retención de buckets y auditoría. Validar transporte HTTPS de API y seguridad del canal PostgreSQL antes de usar credenciales reales; QA conserva SSL off y límites PUBLIC conocidos de C2.2, no modificados aquí.

D2/D3 deben probar SQL en PostgreSQL 17 autorizado: grants efectivos, constraints, concurrencia/locks reales, unicidad de token activo, replay con carrera y revocación, expiraciones/reloj, fallo de COMMIT sin reintento, auditoría append-only y ausencia de lectura fuera de alcance. Si se revierte: bandera deshabilitada, snapshot revisado y retirada solo de grants D1, preservando trazabilidad. Nada autoriza frontend ni activación OIDC.

Maestro V1 intacto: SHA-256 `3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088`. No se abrieron conexiones a QA/institucional ni se modificaron roles, ACL, HBA, contraseñas o infraestructura en D1. No se afirma nueva inspección de integridad viva: se conservó el código maestro y no hubo operaciones contra bases.

`git status` incluye trabajo C2.3 previo y adiciones D1; sin staging/commits/merges/pushes. Estado al cierre y whitespace se registran debajo. Siguiente etapa sugerida: revisión/autorización D2, **sin ejecutarla**.



### Registro Git final

```text
 M apps/api/.env.example
 M apps/api/package-lock.json
 M apps/api/package.json
 M apps/api/src/app.module.ts
 M apps/api/src/app.service.ts
 M apps/api/src/config/env.validation.spec.ts
 M apps/api/src/config/env.validation.ts
 M apps/api/src/database/database.module.ts
 M apps/api/src/database/postgres.service.spec.ts
 M apps/api/src/database/postgres.service.ts
 M apps/api/src/modules/iam/domain/access-policy.spec.ts
 M apps/api/src/modules/iam/domain/access-policy.ts
 M apps/api/src/modules/iam/iam.module.ts
 M apps/api/src/modules/iam/infrastructure/access.repository.ts
 M apps/api/src/modules/iam/infrastructure/authorization-sql.ts
 M apps/api/test/iam-org-blocked.e2e-spec.ts
 M apps/api/test/operaciones.e2e-spec.ts
 M apps/api/test/setup-http.ts
?? Untitled
?? apps/api/scripts/
?? apps/api/src/database/qa-connection.spec.ts
?? apps/api/src/database/qa-connection.ts
?? apps/api/src/modules/iam/application/iam.service.spec.ts
?? apps/api/src/modules/iam/application/iam.service.ts
?? apps/api/src/modules/iam/domain/iam-settings.ts
?? apps/api/src/modules/iam/domain/password-hasher.spec.ts
?? apps/api/src/modules/iam/domain/password-hasher.ts
?? apps/api/src/modules/iam/domain/session-model.ts
?? apps/api/src/modules/iam/infrastructure/iam.repository.spec.ts
?? apps/api/src/modules/iam/infrastructure/iam.repository.ts
?? apps/api/src/modules/iam/presentation/
?? apps/api/test/fixtures/
?? apps/api/test/iam-v2.e2e-spec.ts
?? apps/api/test/qa-runtime.readonly.mjs
?? docs/casos-uso/D1-IAM-V2.md
?? docs/iam/
?? docs/seguridad/
?? infra/qa/c1.1/
?? infra/qa/c1/
?? infra/sql/migrations/
?? scripts/
```

`git diff --check`: sin errores. Las entradas C2.3/Untitled anteriores se conservan; los archivos nuevos se comprobaron además con diff --no-index --check. Sin commits ni publicación.

**D1 preparada. Migración V2 no aplicada. PostgreSQL QA e institucional sin modificaciones.**
