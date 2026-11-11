# Avance funcional y evidencia del bloque B0

Fecha: 2026-11-11 (America/Mexico_City). Rama: feat/codex-acelerado-b0. Base: 78c67cbf5a8ddac57589bd3730bda3b30f9a7fc9. Worktree: /tmp/SIGE-H-acelerado-b0. El commit de entrega es el que introduce este registro; consultar git log -1 en esta rama. No se fusionó ni desplegó.

## Alcance real

| CU | Estado de fuente | Estado técnico observado | Pendiente |
|---|---|---|---|
| CU-OPS-01 | PROP | Liveness existente retorna 200, con BD ausente; verificado por HTTP real | Despliegue/aceptación institucional |
| CU-OPS-02 | PROP | Readiness existente; rama 503 sin BD comprobada; no se inventan colas | QA autorizada, menor privilegio efectivo, prueba real 200; colas cuando existan |
| CU-OPS-03 | PROP | BACKEND_IMPLEMENTADO, HTTP real 200, OpenAPI y prefijo consistentes | Aceptación de contraparte; clientes cuando existan |
| IAM/ORG/PER y resto | AC/PROP/FUT según matriz | No implementados en esta tanda | Dependencias/decisiones en ROADMAP_BLOQUES |

Endpoint nuevo: GET /api/v1/meta/version, operationId getApiContractVersion. Respuesta exacta: {"apiVersion":"1.0.0","apiBasePath":"/api/v1"}; Cache-Control: no-store. No persiste ni simula estado. No devuelve información de cuentas/hospitales, secretos, SHA ni detalles del servidor. Versión de contrato API y package.json se distinguen explícitamente.

Rutas efectivas de esta rama: GET /api/v1; GET /api/v1/health/live; GET /api/v1/health/ready; GET /api/v1/health; GET /api/v1/meta/version. Swagger: http://localhost:3000/docs y JSON http://localhost:3000/docs/openapi.json si se arranca localmente con ese puerto/configuración y Swagger permitido. No hay servidor permanente dejado en ejecución. /docs deshabilitado en producción y con SWAGGER_ENABLED=false, probado. El artefacto docs/api/openapi.json se obtuvo por GET del backend compilado; no se editó manualmente.

## Pruebas y comandos

Desde apps/api:

- npm run lint: OK, oxlint con análisis de tipos.
- npm run build: OK, Nest/TypeScript ESM.
- npm test: 24/24 tests unitarios, cuatro archivos. Incluye transacciones COMMIT incierto y validación de entorno heredados; unitarias no prueban PG real.
- npm run test:e2e: 5/5 tests HTTP en un archivo: endpoint, contrato, docs deshabilitado, producción, concurrencia (12 consultas). AppModule y controladores reales; PG_POOL tripwire falla ante cualquier query/connect. Solo se omite el sondeo opcional de AppService al arrancar para aislar HTTP. No se presenta como integración PG.
- npm run test:smoke: OK, backend compilado completo sin proveedores reemplazados. Cwd/socket privado vacío; no PostgreSQL ni .env real. Observado: versión 200, liveness 200, readiness 503, Swagger UI/JSON 200. Genera docs/api/openapi.json y cierra proceso/puerto.
- npm run test:integration: salida 1 ESPERADA, bloqueado antes de importar AppModule por falta de opt-in QA. No se ejecutaron los tests SQL. No se copiaron .env ni contraseñas reales; el gate de destino no certifica rol efectivo ni autoriza escrituras.
- prettier --check sobre archivos nuevos: inicialmente encontró tres archivos; formateados con --write. Revisión final: todos los archivos comprobados cumplen Prettier.
- Cotejo Python: 271 filas coincidentes guía/catálogo, IDs únicos, 18 módulos, 270 rutas únicas, 99 AC/123 PROP/49 FUT y 188 P0/57 P1/26 P2; roadmap particiona 271 IDs una vez cada uno.
- git diff --check de cambios rastreados: OK. Al revisar el staging completo se detectaron espacios y EOF preexistentes en la guía suministrada, conservados intencionalmente para mantener bytes/hash originales. Las líneas vacías adicionales de documentos generados se corrigieron; revisión staged excluyendo únicamente esa fuente: OK. Revisión dirigida de bootstrap, módulo, endpoint, suites y traslado de integración: sin errores relevantes. Escaneo de patrones de credenciales y artefactos: cero coincidencias; no certifica ausencia absoluta de secretos. Huellas SHA-256 de los archivos ajenos en main: sin cambios.

Limitación del entorno: primeras invocaciones HTTP fallaron con listen EPERM dentro del sandbox. Se repitieron con autorización de puerto loopback local y pasaron; no fue fallo de negocio. Docker ps requirió permiso de socket y solo leyó metadatos de contenedores.

## Cómo reproducir

En apps/api con dependencias instaladas: npm run build; npm run lint; npm test; npm run test:e2e; npm run test:smoke. Las pruebas HTTP necesitan permiso para bind loopback temporal. test:smoke configura automáticamente valores aleatorios solo para el proceso, usa socket PG inexistente en directorio privado, verifica HTTP y exporta OpenAPI; no se deben copiar credenciales reales para ejecutarlo.

La integración con BD sigue bloqueada. Antes de usar test:integration se requiere autorización QA, rol efectivo seguro y revisión DT-02/DT-10. No se da una receta que use credenciales ni base institucional.

## Riesgos y límites

Identidad, facultades por hospital/división/servicio/vigencia y QA bloquean negocio. No se alteraron tablas, roles, grants, Docker ni migraciones. No se reintentaron escrituras ni se escribió en BD. La consulta metadata no maneja historia, turnos, cobertura ni offline. No se afirma implementación Angular/Android, tiempos clínicos, colas ni aprobación hospitalaria. Orquestador y Antigravity siguen suspendidos.

Siguiente bloque recomendado: B1 tras decisión IdP/local y destino QA; comenzar con fichas IAM-01..04 y consultas ORG visibles. Si continúa bloqueado, avanzar análisis de esas fichas y propuestas sin publicar datos ni inventar sesiones.

## Archivos de entrega

La relación exacta se conserva en ARCHIVOS_B0.md; incluye fuentes locales suministradas copiadas literalmente a esta rama, sin modificar originales en main. No se incorporaron archivos IAM ajenos.
