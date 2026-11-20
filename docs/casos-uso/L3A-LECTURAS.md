# L3A — preparación de CU-PER-02/03/17, CU-CAL-12 y CU-REP-01

Fuentes: DDL maestro V1 exacto, IAM V2/D2.2 y autorización L3A. Subconjunto de lectura para personal → programación → indicadores. No implementa el expediente completo ni la búsqueda por RUD/categoría de CU-PER-02.

Rutas preparadas: GET /empleados, /empleados/{empleadoId}, /contratos/{contratoId}/adscripciones, /programaciones y /tableros/coordinacion, bajo /api/v1. No se declaran operativas QA. L3A_READS_ENABLED=false por defecto, además de IAM deshabilitado por defecto; no se habilitan por aplicar grants únicamente.

Hospital y servicio obligatorios; división opcional coherente con el servicio. Padrón/adscripción: fecha ISO de calendario explícita, contratos con estado ACTIVO y vigencias inclusivas de contrato/adscripción. No reconstruye estados contractuales históricos. Detalle devuelve datos identificativos mínimos y página de adscripciones visibles, no todo el expediente. RUD, segundo apellido, categoría, tipo contractual y auditoría documental excluidos.

Programación/indicadores: intervalo de instantes con zona u offset, [desde,hasta), máximo 168 horas. Se seleccionan jornadas solapadas, incluidas nocturnas; estados no se confunden con asistencia. Paginación UUID ascendente estable y limit 1–100. Dashboard por servicio: jornadas por estado, empleados programados distintos y horas-persona programadas dentro de ventana (solo PROGRAMADA/CERRADA); no asistencia ni cobertura efectiva.

Facultades propuestas pendientes de ratificación/asignación: PERSONAL_CONSULTAR, PROGRAMACION_CONSULTAR, TABLERO_CONSULTAR. No se insertan en permisos ni se atribuyen a roles existentes. Reutilizar IamService y AUTHORIZED_SCOPES_CTE con mandato/vigencia y filtro de ámbito en cada SELECT, incluida la segunda lectura del detalle. Auditar decisiones; denegar por defecto. No RLS nueva, no escritura de negocio.
