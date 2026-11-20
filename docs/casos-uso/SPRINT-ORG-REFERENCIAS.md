# Sprint — referencias organizacionales autorizadas

Fuentes: DDL V1 exacto, autorización del sprint, ORG/IAM existentes y grants D2.1-G. Estado: implementación limitada a los campos SQL ya autorizados; prueba real QA requerida antes de declararla operativa.

`GET /api/v1/hospitales`, `/hospitales/{hospitalId}/divisiones`, `/servicios`: identidad de sesión, facultad `CATALOGOS_ADMINISTRAR`, mandatos/roles vigentes, padres activos y filtro SQL por alcance en cada lectura. Hospitales admite filtro opcional; divisiones/servicios exigen hospitalId. Paginación por UUID ascendente, cursor exclusivo, limit 1–100; respuesta items/nextCursor/limit/order. Auditoría de la decisión, denegación por defecto y errores 400/401/403/503.

Proyección: id, hospitalId, divisionId, servicioId, activo. **Nombres, claves y zona horaria no están autorizados al rol SQL actual y no se simulan.** No nuevas facultades ni grants; no subáreas o rutas administrativas. IAM permanece deshabilitado por defecto. Las pruebas reales usan únicamente datos sintéticos y se limpian según el registro D2.2.
