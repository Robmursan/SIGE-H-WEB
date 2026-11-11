# B1 — Evidencia y revisión focalizada

Fecha: 2026-11-11. Base 0d86ce0; entrega en rama feat/codex-b1-iam-org. Estado: PREPARADO_NO_PUBLICADO, no aprobación funcional hospitalaria. Resultados/comandos y límites detallados en AVANCE_FUNCIONAL.md.

| Control | Resultado observado | Límite |
|---|---|---|
| ESM/Vitest/stack | Lint/build y 64 unitarias correctas; sin dependencias nuevas | No instalación limpia npm ci en esta entrega |
| Identidad | Proveedor runtime siempre rechaza antes de queries | No autenticación funcional |
| Hospital/división/servicio | Tests reales de policy rechazan ámbito ajeno, vigencia, usuario/padres inactivos y jerarquía incoherente | Aislamiento SQL real pendiente de QA |
| Parámetros/SQL | Adapter enlaza actor/permiso/UUID/límite, catálogo fijo; ningún SQL de mutación en runtime | Preparación/parser de PostgreSQL no comprobados sin conexión |
| Cambios de permisos | SQL final repite predicates de cuenta/roles/permiso/vigencia/jerarquía, sin caché | Carrera de revocación real pendiente de QA; no revoca lecturas ya iniciadas |
| DTO | UUID/cursor/limit 1..100, rechazo de booleanos/arrays/null/hex y campos extra | Contrato HTTP final no publicado |
| Exposición | 17 tests HTTP; IAM/ORG con/sin header no existen (404), OpenAPI solo cinco rutas B0 | No equivale a 401/403 ni prueba de JWT |
| Runtime compilado | Sin proveedores reemplazados: OPS 200, readiness sin PG 503, docs 200 | Sin PostgreSQL real |
| QA | Compose válido estáticamente; gate de integración rechaza antes de conexión | Cluster/roles/baseline/fixtures no provisionados |
| SQL V2 | Archivos .propuesta.sql separados y condicionales; maestro sin cambios | No se ejecutaron ni se validaron en servidor |
| Secretos | Sin credenciales reales, claves privadas, tokens JWT completos ni .env de datos en cambios; solo valores sintéticos de tests | Escaneo de patrones no prueba ausencia absoluta |

Revisión dirigida: se corrigió coerción permisiva de limit, se tiparon placeholders SQL incluso en catálogos que no usan todos los filtros, y se usó pg_class para contar tablas físicas sin exigir SELECT en tablas ajenas al lote. No se introduce bypass administrativo ni mutación de las 51 tablas.

No se reportan críticos/altos nuevos habilitados en runtime. Identidad/SQL sin validar constituyen bloqueos altos de publicación, mitigados dejando todas las rutas de negocio ausentes. La deuda media sobre permisos de catálogos, digest de imagen y snapshots entre páginas queda registrada, sin convertirla en autenticación ficticia.

Preservación: comparar SHA-256 de archivos ajenos capturados al inicio y HEADs de worktrees; copiar únicamente la lista de cambios revisada a la rama persistente desde B0 exacto. El listado de archivos y commit permite reproducir el diff sin tocar main ni el orquestador.
