# Estado real del repositorio

Corte inicial 2026-11-11. Principal /home/robreport/Documents/SIGE-H en main, HEAD 7a877cd; conserva cambios ajenos IAM y fuentes no registradas. No se borraron ni incorporaron sus cambios IAM. Worktree propio: /tmp/SIGE-H-acelerado-b0, rama feat/codex-acelerado-b0 desde 78c67cb. Crear esta rama no fusiona ramas anteriores.

## Ascendencia comprobada

7a877cd → 3d884cb → 78c67cb → 1f14458 → 54653dd. Todos existen. Rama fix/sprint-0.1-hardening termina en 34e9445, derivada de 3d884cb: contiene planificación IAM adicional y no es ancestro de 78c67cb. Feature/auth-login apunta a adc714c y no es una implementación IAM terminada. Rama del orquestador conserva su propio worktree; no se modifica ni activa.

Base elegida: 78c67cb (transacciones con COMMIT incierto, timeouts, errores saneados y health live/ready); evita arrastrar el orquestador suspendido y código IAM ajeno sin registrar. La ficha IAM de 34e9445 es histórica y condicionada a V2, no autorización para credenciales locales. No se hizo merge/cherry-pick/push.

## Capacidades

NestJS 12, Node v26.7.0, npm 12.0.2, TypeScript 6, ESM con imports .js, Vitest 4 (instalado 4.1.12), pg; scripts reales lint/build/test/test:e2e. Dependencias instaladas reutilizadas mediante symlink local ignorado, sin instalar ni modificar package-lock por ese motivo. No se cambia stack.

Rutas base: GET /api/v1; GET /api/v1/health/live; GET /api/v1/health/ready; GET /api/v1/health; Swagger /docs y /docs/openapi.json en entorno permitido. Módulos de negocio son contenedores vacíos en esta base; no existe autenticación funcional ni clientes Angular/Android funcionales encontrados. TypeORM/JWT instalados no acreditan IAM implementado.

La suite E2E previa conecta a PostgreSQL al arrancar AppModule; no debe ejecutarse por defecto sin QA explícita. Se separará el smoke HTTP sin BD de la integración opt-in. Baseline de dependencias/código se valida con comandos propios; no se heredan resultados históricos como evidencia actual.

## Docker / QA

Consulta read-only docker ps: sigeh_postgres, postgres:17-alpine, puerto publicado en 0.0.0.0:5432 y [::]:5432. Contradice el diagnóstico histórico que decía 127.0.0.1. Esto no prueba accesibilidad externa (depende del firewall), pero requiere revisión del propietario antes de datos sensibles. No se cambió Compose ni se abrió PostgreSQL. No se acredita QA aislada ni rol de mínimo privilegio. No se usará API operativa con superusuario.

La conexión QA continúa pendiente; no habilita writes ni acceso a datos institucionales. Fuente de metadatos SQL en esta entrega: DDL V1, sin consulta de filas ni migraciones.

## Primer bloque entregado

CU-OPS-03 implementado en OperacionesModule: GET /api/v1/meta/version. Constantes compartidas con prefijo y OpenAPI. La suite HTTP por defecto ya no abre conexiones PG: conserva los tests SQL en test/integration y exige opt-in explícito de destino QA. No se acredita por eso menor privilegio efectivo.

Prueba runtime compilada, sin overrides: metadata 200, liveness 200, readiness 503 por ausencia intencional de socket PG y Swagger 200. OpenAPI generado con cinco rutas. Ver AVANCE_FUNCIONAL.md para comandos/resultados, límites y listado exacto de archivos.

Referencias de framework contrastadas con documentación primaria consultada el 2026-11-11: https://docs.nestjs.com/openapi/introduction y https://docs.nestjs.com/fundamentals/testing. Se conservaron las APIs presentes en dependencias locales; no se añadió librería.
