# C1 — evidencia y archivos entregados

Fecha 2026-11-11. Worktree `/home/robreport/Documents/SIGE-H-b1-iam-org`; rama `feat/codex-b1-iam-org`. Solo archivos nuevos de C1; archivo preexistente no versionado `Untitled` preservado. No se modificó aplicación, maestro, Compose ni propuestas V2 previas. No se ejecutaron scripts SQL de provisión, negativas, rollback ni generador/lanzador de credenciales.

## Validaciones observadas

| Comando / acción | Resultado real |
|---|---|
| `git status --short`, `git branch --show-current` | Rama esperada; inicialmente solo `?? Untitled` |
| `rg --files` y lecturas de fuentes descritas en plan | Inspección completada; `scripts/qa` no existía antes de C1 |
| Consulta SELECT de catálogos por Docker/psql | Primer intento denegado sandbox; repetición autorizada exit 0. Sin SQL de escritura; hallazgos en plan |
| `sha256sum /home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql` | Coincide hash solicitado antes y después |
| `python3 scripts/qa/c1/verificar-estatico.py` | PASS final; comprueba hash, consultas SELECT-only, dos grants exactos, guardas de destino/trust/rol previo y ausencia de literales de contraseña/URI en SQL |
| AST Python mediante ast.parse en los tres scripts | PASS, sin ejecutar generador ni lanzador |
| `npm run build` en apps/api | Exit 0; no se arrancó servidor |
| `npm run lint` en apps/api | Exit 0 |
| Vitest unitario seleccionado (comando abajo) | No inició: EROFS en node_modules/.vite-temp, dependencias compartidas fuera del worktree. La solicitud de repetición con escalación fue interrumpida por reinicio del servidor; no hay resultado posterior |
| `git diff --check` | Exit 0 para archivos tracked; además se comprueba cada archivo nuevo con diff --no-index --check |
| Búsqueda de secretos / revisión de archivos nuevos | Sin contraseñas literales, JWT, cadenas de conexión autenticadas ni datos personales reales; referencias a nombres de variables/roles no son secretos |

La primera ejecución del validador estático detectó un falso positivo: el texto SECURITY DEFINER de un mensaje de excepción coincidía con una búsqueda de DDL. Se acotó la regla a sentencias peligrosas; el resultado final pasó. No se corrigió ni modificó ningún estado PostgreSQL como parte de esa validación.

Comando de pruebas unitarias intentado, tras inspeccionar sus mocks (PoolClient/Pool/repositorios simulados, sin conectores reales):

```sh
cd /home/robreport/Documents/SIGE-H-b1-iam-org/apps/api
npm test -- src/database/postgres.service.spec.ts src/config/env.validation.spec.ts src/modules/iam/domain/access-policy.spec.ts src/modules/organizacion/infrastructure/organization.repository.spec.ts src/modules/organizacion/application/organization-queries.spec.ts
```

No se ejecutó test:integration, test:e2e ni test:smoke; podrían conectar a un servidor/base real. No se ejecutaron pruebas negativas activas en QA, aunque incluyan ROLLBACK. No se afirma que pruebas SQL futuras, autenticación SCRAM app, permisos efectivos, rollback o aislamiento multihospital hayan pasado. El SQL está revisado estáticamente; no se ha validado con parser/servidor PostgreSQL. Build/lint cubren compatibilidad del código existente, no prueban los privilegios propuestos.

## Inventario exacto de archivos nuevos y motivo

| Ruta desde la raíz | Propósito |
|---|---|
| `docs/seguridad/C1-postgresql-qa.md` | Diagnóstico, fuentes, matriz mínima por tabla, plan bloqueado, credenciales, comandos futuros, riesgos, aceptación, rollback y bloqueos IAM V2 |
| `docs/seguridad/C1-evidencia.md` | Resultados reales, límites de validación e inventario de archivos |
| `infra/qa/c1/01-auditoria.sql` | SELECT de roles, membresías, ownership, ACL de relaciones/columnas/rutinas, defaults, extensiones, HBA y PUBLIC |
| `infra/qa/c1/02-provision.propuesta.sql` | Provisión no ejecutada, LOGIN sin contraseña inicial; aborta si las precondiciones no están satisfechas |
| `infra/qa/c1/03-public.revision.sql` | Plantilla totalmente comentada de revocaciones potenciales, sujeta a evaluación de impacto |
| `infra/qa/c1/04-verificacion.sql` | Verificaciones positivas de salud/metadatos y negativas de privilegios efectivos mediante SELECT |
| `infra/qa/c1/05-negativas.propuesta.sql` | Intentos negativos activos con SQLSTATE esperado, prohibidos durante C1 |
| `infra/qa/c1/06-rollback.propuesta.sql` | Reversión específica de dos grants/ajustes/rol; guardas y RESTRICT, nunca CASCADE |
| `scripts/qa/c1/generar-secreto.py` | Generación futura fuera del repo, 0700/0600, sin salida de contenido |
| `scripts/qa/c1/iniciar-api.py` | Inyección futura a proceso NestJS, destino QA fijo y validación del archivo secreto |
| `scripts/qa/c1/verificar-estatico.py` | Verificación local reproducible sin conexión, sin ejecutar SQL |

Los once archivos están nuevos y sin staging/commit. El diff de tracked está vacío; el contenido nuevo se revisa como adiciones desde /dev/null. No se alteró `Untitled`. Scripts anteriores `infra/qa/propuesta-rol-qa-lectura.sql` y `infra/sql/propuesta-rol-sigeh-app-minimos-privilegios.sql` quedan como antecedentes sin ejecutar: el primero concede lecturas prematuras para las rutas HTTP reales y el segundo apunta a la base institucional. No usarlos para C2; no se sobrescriben en C1.

## Decisión de salida

C1 documental/estática preparada. C2 detenida por trust, revisión de PUBLIC y search_path efectivo; no hay permiso para corregirlos en esta actuación. Para avanzar se requiere nueva autorización explícita y propuesta revisada a partir de auditoría completa, sin improvisar un cambio riesgoso. Ningún avance a D/IAM V2 ni E/E2E.

Etapa C1 preparada. Ningún SQL aplicado. No se modificó PostgreSQL institucional ni PostgreSQL QA.
Se realizaron exclusivamente SELECT de catálogos QA; la confirmación de ausencia de SQL aplicado se refiere a cambios.
