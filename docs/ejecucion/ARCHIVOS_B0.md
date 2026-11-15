# Archivos del bloque B0

Raíz exacta del worktree: /tmp/SIGE-H-acelerado-b0. Rutas siguientes relativas a esa raíz; corresponden al diff contra 78c67cb, no al estado ajeno de main.

| Ruta | Cambio |
|---|---|
| `.gitignore` | Creado |
| `AGENTS.md` | Copia literal de fuente suministrada; original intacto |
| `SIGE-H_GUIA_PASO_A_PASO_DESARROLLO_CON_AGENTES_v1_0.md` | Copia literal de fuente suministrada; original intacto |
| `apps/api/package.json` | Modificado |
| `apps/api/src/app.module.ts` | Modificado |
| `apps/api/src/config/api-contract.ts` | Creado |
| `apps/api/src/main.ts` | Modificado |
| `apps/api/src/modules/operaciones/dto/api-version-response.dto.ts` | Creado |
| `apps/api/src/modules/operaciones/get-api-version.use-case.ts` | Creado |
| `apps/api/src/modules/operaciones/operaciones.controller.ts` | Creado |
| `apps/api/src/modules/operaciones/operaciones.module.ts` | Creado |
| `apps/api/test/app.e2e-spec.ts` | Eliminado en ubicación previa; trasladado a test/integration |
| `apps/api/test/integration/app.database.e2e-spec.ts` | Creado |
| `apps/api/test/operaciones.e2e-spec.ts` | Creado |
| `apps/api/test/runtime-ops.smoke.mjs` | Creado |
| `apps/api/test/setup-http.ts` | Creado |
| `apps/api/vitest.config.e2e.ts` | Modificado |
| `apps/api/vitest.config.integration.ts` | Creado |
| `docs/SIGE-H_Dossier_Codex_Desarrollo_Acelerado.md` | Copia literal de fuente suministrada; original intacto |
| `docs/api/openapi.json` | Creado |
| `docs/casos-uso/CU-OPS-03.md` | Creado |
| `docs/ejecucion/ARCHIVOS_B0.md` | Creado |
| `docs/ejecucion/AVANCE_FUNCIONAL.md` | Creado |
| `docs/ejecucion/DECISIONES_PENDIENTES.md` | Creado |
| `docs/ejecucion/DEUDA_TECNICA.md` | Creado |
| `docs/ejecucion/ESTADO_REAL_REPOSITORIO.md` | Creado |
| `docs/ejecucion/FUENTES_REMOTAS.md` | Creado |
| `docs/ejecucion/INVENTARIO_FUENTES.md` | Creado |
| `docs/ejecucion/MATRIZ_CU_DEPENDENCIAS.md` | Creado |
| `docs/ejecucion/METODO_Y_PROMPTS_FUENTE.md` | Creado |
| `docs/ejecucion/ROADMAP_BLOQUES.md` | Creado |

La suite test/app.e2e-spec.ts se conserva en test/integration/app.database.e2e-spec.ts, ajustando imports relativos y expectativa de ruta OPS-03. No se eliminan sus pruebas PG; se separan del smoke sin BD.

Documentación de planificación: inventario, matriz de 271 CU, roadmap y decisiones. Evidencias: AVANCE_FUNCIONAL.md, ESTADO_REAL_REPOSITORIO.md y OpenAPI generado. No se incluyeron .env, logs, caches, node_modules, scripts de migración nuevos ni código IAM ajeno.
