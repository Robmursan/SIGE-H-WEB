# Alcance y clasificación B1

Estado documental y estado técnico son columnas distintas. AC no implica aprobación institucional ni IMPLEMENTADO. CU-OPS-03 conserva PROP y su implementación B0; no fue aprobado por esta entrega.

| CU | Fuente | Viabilidad actual | Entrega B1 |
|---|---|---|---|
| IAM-01..04 | AC | Sin identidad/sesiones verificables | BLOQUEADO_HTTP; arquitectura y propuestas V2; acceso persistido como componente parcial |
| IAM-05..06 | PROP | Sesiones no existen V1 | BLOQUEADO |
| IAM-07..09 | AC | usuarios V1 permite datos base, sin credenciales/autoridad | BLOQUEADO_HTTP; no mutaciones ni CRUD abierto |
| IAM-10..12 | AC | Catálogos/asignaciones V1 disponibles; identidad/facultades/grants pendientes | BLOQUEADO_HTTP; política y lectura interna de asignaciones preparadas |
| IAM-13 | PROP | Permisos efectivos V1 consultables tras identidad | PREPARADO_PARCIAL_NO_PUBLICADO; AccessRepository/policy, sin endpoint/contrato final |
| IAM-14..15 | PROP | Matriz versionada/autoridad no resueltas | BLOQUEADO |
| IAM-16 | PROP | Auditoría de denegaciones/canal no resuelto | BLOQUEADO |
| ORG-01/04/07/10 | AC | Lecturas V1 sin cambiar esquema; identidad y QA bloquean exposición | PREPARADO_NO_PUBLICADO; DTO+policy+use case+SQL+tests |
| ORG-02 | PROP | Write/autoridad no disponibles | BLOQUEADO |
| ORG-03/05/06/08/09/11/12 | AC | Tablas existen; autoridad/reglas de inactivación/QA pendientes | BLOQUEADO; no writes preparados como completos |
| ORG-13 | PROP | Composición paginada/árbol requiere definir contrato | PENDIENTE, no implementado |

No se publican operaciones IAM/ORG. La configuración QA, las propuestas SQL y las pruebas de integración listas para ejecutar no se etiquetan como integración funcional validada. Token revocado/refresh/logout no se prueban con un token falso: quedan pruebas faltantes explícitas hasta tener proveedor real.
