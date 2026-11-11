# B1 — Contrato interno de lecturas de organización

Aplica a CU-ORG-01/04/07/10 (AC). No HTTP hasta identidad/QA/matriz autorizadas. Se prepara domain/policy, adapters PG parametrizados, use cases y DTO; ninguna escritura.

Columnas DDL: hospitales(hospital_id,clave,nombre,zona_horaria,activo); divisiones(division_id,hospital_id,clave,nombre,activo); servicios(servicio_id,hospital_id,division_id,clave,nombre,activo); subareas(subarea_id,hospital_id,servicio_id,clave,nombre,activo). No existen columnas de autorización en esas tablas; se derivan de usuario_roles + rol_permisos, no del JWT.

Una asignación hospitalaria incluye descendientes; divisional incluye sus servicios; de servicio incluye solo ese servicio/subáreas. Un grant de servicio no da acceso a otros servicios de su división. Leer encabezado hospital/división para navegar un servicio no permite enumerar todos los hijos. Usuarios y todos los padres deben estar activos; vigencias [desde,hasta), fin null abierto. Las FKs simples de usuario_roles se validan contra jerarquía persistida, incluyendo servicio↔división cuando ambas están presentes. ADMIN_SISTEMA no tiene bypass.

Limitación institucional: V1 no define permiso de lectura organizacional específico. Se usa exclusivamente el código existente CATALOGOS_ADMINISTRAR como restricción conservadora; no se crea código, se concede grant ni se afirma que esta matriz esté aprobada. Ampliar lectura a otros operadores requiere decisión expresa y pruebas.

El precheck de IAM usa hora de PostgreSQL; las consultas ORG vuelven a filtrar permisos/usuario/vigencias/jerarquía en el mismo statement. No hay caché de permisos entre requests. Para futuros writes la autorización debe revalidarse dentro de la misma transacción y respetar locks; este lote solo lee.

Paginación: límite 50 por defecto, máximo 100, UUID ascendente y cursor exclusivo. Hospital requerido en divisiones/servicios/subáreas; servicio requerido en subáreas. El body de respuesta interno usa id, clave, nombre y referencias jerárquicas disponibles; no PII de personal. Cambios concurrentes pueden aparecer entre páginas; no se promete snapshot de múltiples páginas.
