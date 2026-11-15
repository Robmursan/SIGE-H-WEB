# CU-OPS-03 — Consultar versión de contrato API

Estado fuente: PROP. Prioridad: P0. Desarrollo autorizado en la dirección maestra de 2026-11-11; sin aprobación institucional implícita.

Fuente: catálogo CU/API §5.18, guía §7/§9.18/§17, SQL maestro V1 inventariado. Actor: desarrollador/cliente técnico. Objetivo: identificar la versión de contrato servida antes de integrar clientes, sin depender de PostgreSQL. Hospital/división/servicio: no aplica; no devuelve recursos de negocio.

Precondición: configuración válida y proceso HTTP activo. No requiere login ni credenciales de negocio. Operación de metadatos disponible sin JWT; el despliegue interno/control de red es responsabilidad de infraestructura, no se afirma aquí. No se agrega permiso inexistente.

Contrato técnico mínimo acordado para implementación de esta tanda: `GET /api/v1/meta/version`, operationId `getApiContractVersion`, 200 JSON `{"apiVersion":"1.0.0","apiBasePath":"/api/v1"}`. Versión corresponde a `info.version` de OpenAPI; no es package.json (0.0.1) ni versión del motor PostgreSQL. Constantes únicas compartidas con configuración Swagger/prefijo. No inputs, DTO request ni validaciones de campos inexistentes. No se anuncian 401/403/409/422 porque no hay esas ramas para esta consulta técnica.

Flujo: recibir GET → caso de uso obtiene constantes de contrato → DTO de respuesta → JSON 200. Mismo resultado si BD no está disponible o Swagger está deshabilitado; no promete que /docs exista. POST no permitido: 404 por no existir ruta. Consultas concurrentes no comparten estado mutable.

Tablas, columnas y repositorio: ninguno necesario; no persistencia en memoria ni simulación de BD. No transacción, writes, idempotency key, evento histórico o WebSocket. No expone SHA de repositorio, hostname, usuarios, hospital, rutas físicas, secretos ni configuración privada. Evitar caché obsoleta con Cache-Control: no-store.

Angular/Android: contrato listo para consumidores técnicos; no se crea pantalla de negocio para dos metadatos. Clientes aún no implementados. La respuesta no concede autorización offline ni comprueba compatibilidad de versiones por sí sola.

Aceptación Given/When/Then:

1. Dada la API configurada, GET retorna exactamente el DTO 200 sin JWT ni consulta PG.
2. Dado Swagger habilitado, apiVersion coincide con OpenAPI info.version y apiBasePath con todas las rutas efectivas.
3. Dado Swagger deshabilitado, GET sigue disponible y /docs retorna 404.
4. Dado entorno production con Swagger solicitado, /docs y JSON siguen 404 y metadatos siguen 200.
5. Dado cualquier fallo de BD, la consulta de versión/liveness no lo consulta; PG_POOL está reemplazado por un tripwire que lanza ante cualquier uso en pruebas HTTP sin BD.
6. Dadas consultas simultáneas, respuestas idénticas, sin caché y sin mutar la fuente de contrato.
7. Dado POST al mismo path, retorna 404 y no modifica estado.

Pruebas: HTTP Nest/Supertest real con AppModule y bootstrap compartido, contrato OpenAPI generado y viajes sin BD; unitarias existentes de regresión; lint/build. Tripwire PG solo demuestra ausencia de dependencia, nunca éxito de integración PostgreSQL. Evidencia final: docs/ejecucion/AVANCE_FUNCIONAL.md.

Decisiones pendientes: ninguna de esquema/credenciales para este CU; QA/identidad siguen bloqueando negocio y prueba de readiness real. CU-OPS-03 se limita al contrato descrito, no implementa sincronización ni administración operativa.
