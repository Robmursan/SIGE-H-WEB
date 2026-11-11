# CU-ORG-04 — Consultar divisiones por hospital

Estado documental: AC / P0, conservado. Estado de entrega B1: PREPARADO_NO_PUBLICADO; no CU funcional terminado. Fuente: catálogo §5.2, guía §6/§7/§9.2/§17, SQL V1. Actor: Operador con identidad verificable y autorización persistida; hospital/división/servicio se restringen en servidor.

Objetivo: catálogo reutilizable de organización para personal/dotación/programación. Contrato oficial propuesto: `GET /hospitales/{hospitalId}/divisiones` bajo /api/v1; operationId previsto `listarDivisiones`. No hay controller ni ruta HTTP registrados. La API devuelve 404 para esa ruta y no la anuncia en Swagger.

Tablas reales: hospitales, divisiones; autorización: usuarios(usuario_id,activo), usuario_roles(rol_id,hospital_id,division_id,servicio_id,vigente_desde,vigente_hasta), roles, rol_permisos, permisos(codigo). Columnas y comportamiento común en B1-LECTURAS-ORG.md. Ningún cambio al esquema. No sesión/credencial en memoria.

Entradas: UUID de ámbito y cursor, limit 1..100, sin campos extra. Precondiciones: proveedor de identidad autorizado, usuario activo, permiso persistido y rol vigente/coherente; lectura de este lote restringida conservadoramente al permiso V1 CATALOGOS_ADMINISTRAR hasta ratificar matriz. No se siembra ni infiere un grant de un nombre de rol.

Flujo: validar frontera → verificar identidad → cargar asignaciones persistidas → política deny-by-default → consulta SQL que vuelve a comprobar autorización y jerarquía en el mismo statement → DTO limitado y paginado. Lista vacía no acredita acceso. Padres inactivos o grant incoherente no dan acceso.

Errores internos preparados: consulta inválida; identidad no disponible/rechazada; acceso denegado. Mapeo HTTP 400/401/403/404 se definirá al habilitar controlador; no se documentan respuestas de rutas inexistentes. No writes, transacción de mutación, eventos históricos ni WS. Cada lectura usa snapshot de statement; no se garantiza revocación retroactiva de una lectura ya iniciada.

Angular: selector jerárquico loading/empty/forbidden, pendiente de API autorizada; Android: selector de servicio autorizado, pendiente. No clientes ficticios ni autorización offline.

Given/When/Then (compartidos con pruebas B1):
1. Usuario activo con permiso/grant vigente → solo elementos de su ámbito, orden UUID/cursor estable.
2. Hospital o servicio ajeno → denegación o cero recursos; ninguna ampliación desde rol administrativo.
3. Vigencia futura/vencida, usuario/jerarquía inactiva, grant incoherente → denegación.
4. Campo extra, UUID inválido o limit fuera de 1..100 → rechazo antes de SQL.
5. Identidad no disponible → cero consultas de negocio; no se acepta actor desde query/body.
6. Revocación entre precheck y query → SQL final revalida; prueba PostgreSQL pendiente en QA autorizada.

Pruebas ejecutadas y límites: docs/ejecucion/AVANCE_FUNCIONAL.md. Integración SQL preparada solo lectura con fixtures sintéticos preautorizados, no ejecutada hasta habilitar QA. Decisiones: identidad, QA y matriz de acceso de catálogos. No se declara IMPLEMENTADO.
