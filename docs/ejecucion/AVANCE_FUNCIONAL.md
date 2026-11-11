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


## Entrega B1 — IAM y organización preparados sin exposición

Rama dedicada: feat/codex-b1-iam-org. Worktree persistente: /home/robreport/Documents/SIGE-H-b1-iam-org. Base exacta preservada: 0d86ce06b3c8b8f182bcbf62025b2ad2449c2771. El commit de entrega es el que introduce este apartado; git log en esa rama proporciona su SHA completo. B0 y cambios ajenos no se mezclan ni se eliminan.

Estado técnico: CU-ORG-01/04/07/10 (fuente AC) PREPARADO_NO_PUBLICADO. Cuatro consultas V1 de hospitales/divisiones/servicios/subáreas con DTO validado, paginación, policy de ámbitos, adapter parametrizado y use case inyectado. IAM tiene repositorio de asignaciones/permisos y política reutilizable; IAM-13 (PROP) preparación parcial, no endpoint terminado. Ningún CU IAM/ORG se declara IMPLEMENTADO ni aprobado institucionalmente. Ver ALCANCE_B1.md para los 29 CU y su situación exacta. OPS-03 permanece PROP y funcional según B0.

La implementación actual de IdentityVerifier rechaza siempre: no decodifica JWT sin verificar, no confía en claims/actor de request y no acepta bypass por entorno. No se montaron controllers IAM/ORG; Swagger sigue exactamente con cinco rutas B0. Acceder con o sin header de autorización a organización/login devuelve 404; eso prueba ausencia de exposición, no autenticación real. No hay nuevos endpoints protegidos utilizables ni UI de negocio habilitada.

Autorización preparada: cuenta y jerarquía activas; vigencias [desde,hasta) con hora de servidor PG; rol_permisos persistido; no ADMIN_SISTEMA mágico; ámbito de servicio no enumera otros servicios. El SQL final revalida todo en el mismo statement y filtra rutas de ancestros. No escribe BD, no cachea permisos, no emite eventos ni declara cobertura/offline.

QA: Compose separado, loopback 55432, red/volumen/base/rol independientes, secreto por archivo, sin auto-importación SQL. Solo se validó config --quiet (salida 0), sin up/pull/create ni conexiones PG. La propuesta de corrección 5432 compartido a localhost no fue aplicada: consumidores LAN desconocidos. El preflight de integración está preparado para rechazar rol elevado/miembro de roles elevados, DML/DDL, falta de esquema o baseline V1 distinta de 51 tablas; no se ejecutó contra PostgreSQL.

SQL propuesto y NO ejecutado: sesiones/refresh, credenciales locales alternativa a OIDC, vínculo issuer/subject, rol QA read-only y fixtures exclusivamente sintéticos sin empleados/credenciales. No se alteró ni recreó ninguna tabla V1. Elegir únicamente propuestas pertinentes tras decidir identidad; faltan aprobaciones separadas de infraestructura, baseline, datos QA y privilegios.

### Calidad observada B1

- npm run lint: OK, sin warnings finales. Advertencia inicial de coerción de limit corregida con tipos estrictos antes del cierre.
- npm run build: OK.
- npm test: 64/64, siete archivos. Política real de dominio, DTO y adapters unitarios; fixtures/mocks de adapters solo en tests, sin atribuirles integración SQL.
- npm run test:e2e: 17/17, dos archivos. HTTP Nest real con tripwire PG; rutas de negocio ausentes, DI interna deny-by-default y regresión OPS/Swagger.
- npm run test:smoke: OK sobre backend compilado sin overrides; versión/liveness 200, readiness 503 con socket PG intencionalmente inexistente, Swagger 200; cinco rutas y OpenAPI idéntico a B0.
- npm run test:integration: bloqueado con salida 1 antes de importar AppModule, sin opt-in/QA. Ocho escenarios de organización SQL preparados; no ejecutados. Tampoco se ejecuta la suite SQL heredada.
- Docker Compose config --quiet: salida 0 con archivo externo temporal de validación, sin mostrar contenido ni iniciar servicios. No prueba disponibilidad de imagen, secreto real, firewall ni baseline.
- Huella SQL maestro V1: intacta. No rutas IAM/ORG decoradas ni SQL de mutación en runtime. Lista exacta de cambios en ARCHIVOS_B1.md. Revisión dirigida en docs/pruebas/B1-evidencia.md.

Cómo repetir pruebas seguras: desde apps/api, npm run lint, npm run build, npm test, npm run test:e2e y npm run test:smoke. E2E/smoke requieren bind loopback temporal. No configurar .env institucional. Dependencias instaladas reutilizadas por symlink local ignorado; no se añadió librería ni se cambió package-lock. La ejecución SQL requiere los gates de infra/qa/README.md y aprobación humana; no se inicia como parte de tests por defecto.

Bloqueos vigentes: identidad autorizada, matriz de lectura organizativa ratificada, QA saneada/rol efectivo y prueba SQL real. Token revocado, refresh replay y logout no tienen implementación comprobable: pruebas explícitamente pendientes, sin tokens ficticios aceptados. No hay frontend conectado ni autorización offline; historia, concurrencia de writes y sesiones esperan sus flujos reales.

Siguiente bloque funcional: resolver identidad/QA, validar lecturas preparadas contra PostgreSQL aislado y abrir IAM-01..04 + ORG-01/04/07/10 únicamente con autorización efectiva y pruebas de sesión/revocación, después conectar selector de ámbito y personal.
