# Matriz CU y dependencias

Inventario cotejado automáticamente: 271/271 filas idénticas entre catálogo §5 y guía §17. Estado original y prioridad se conservan. Las dependencias siguientes son del módulo según guía §9, NO un grafo oficial exhaustivo CU→CU. Las excepciones por CU se detallan en su ficha al seleccionarlo; no se presume DoR de los otros 270.

Ciclo DOT↔CAL: empezar por catálogos CAL y lecturas ORG/PER; después objetivos DOT; por último generar/publicar CAL usando esos objetivos. No ejecutar el grafo de módulos como si fuera un DAG de tareas.

| Módulo | Cantidad | Dependencias declaradas | Brecha |
|---|---:|---|---|
| IAM | 16 | DatabaseModule, PolicyEngine y catálogo de ámbitos. | Tabla `usuarios` y permiso V1 no son un proveedor completo de identidad; falta definir IdP, refresh y política RLS. |
| ORG | 13 | IAM: ScopeGuard; DatabaseModule. | Autoridad orgánica e inactivación con dependencias necesitan reglas formales. |
| PER | 22 | IAM, ORG. | Historial de categorías y almacenamiento de evidencia sensible requieren V2. |
| DOT | 12 | ORG, PER, CAL. | Plaza vacante estructural necesita entidad propia/migración; no registrarla como falsa ausencia. |
| CAL | 21 | ORG, PER, DOT. | Generador de programación, publicación versionada y horas particulares exigen política de transiciones adicional; no asumir que todo trabajador de JA labora todos los festivos. |
| ASI | 15 | PER, CAL, IAM. | Falta tabla de lote/inbox para idempotencia offline y entidad de pase cerrado; diseñar V2 si el ciclo de lote no cabe en V1. |
| INC | 18 | PER, CAL, ASI, IAM. | Versión automática de cada edición y autorización documental necesitan orquestación y quizá V2. |
| MOV | 20 | CAL, PER, IAM, ASI. | Autorización completa por ámbito y atomicidad de aplicación requieren use cases; estados V1 con reglas pendientes de validar. |
| EVE | 12 | PER, CAL, IAM, COB. | Proceso oficial de confirmación de llegada a coordinación y vínculo previo necesidad/asignación todavía requiere decisión/migración V2. |
| COB | 24 | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | DDL V1 no impide todos los solapes de asignaciones ni exceso global de `aplicaciones_cobertura`; requerirá bloqueo transaccional + restricciones/migración V2. |
| ASI_CLIN | 15 | ORG, IAM, COB, BAL. | `mediciones_complejidad` no modela aún todo censo/productividad; módulo de enlace completo es FUT y necesita V2/aprobación. |
| BAL | 18 | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | Ratios, tasas y denominadores heredados requieren decisión explícita y test de regresión; motor SQL reportes aún no existe. |
| DOC | 17 | IAM, INC, AUD, StorageGateway. | FUTURO y bloqueado: falta aprobación institucional y modelo físico. |
| REP | 13 | BAL, COB, INC, ASI_CLIN, IAM. | Indicadores de productividad por especialidad requieren fuentes/migraciones validadas; no copiar fórmulas de hoja sin homologar. |
| MIG | 13 | ORG, PER, DOT, CAL, IAM. | Faltan tablas `importacion_lotes`, `importacion_filas`/mapeos/errores V2; el sistema no debe leer hojas de Drive desde producción sin permisos explícitos. |
| NOT | 6 | IAM, BAL, COB, ASI, MOV. | Outbox/notifications persistentes no existen en V1; requiere V2 para robustez. |
| AUD | 8 | IAM, todos los módulos. | Auditoría V1 necesita política de retención, acceso y generación consistente desde cada use case; logs de denegados pueden requerir canal separado. |
| OPS | 8 | DatabaseModule, IAM, observabilidad. | Falta modelo SQL de inbox/idempotencia, jobs y outbox. Despliegue TI intranet debe validarse. |

## Inventario por CU

| CU | Objetivo | Actor | Contrato propuesto bajo /api/v1 | Prioridad | Fuente | Dependencias de módulo | Avance verificado |
|---|---|---|---|---|---|---|---|
| CU-IAM-01 | Iniciar sesión y emitir tokens | Operador | POST /auth/login | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-02 | Renovar token | Operador | POST /auth/refresh | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-03 | Cerrar sesión y revocar sesión | Operador | POST /auth/logout | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-04 | Consultar perfil y alcances propios | Operador | GET /auth/me | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-05 | Listar sesiones activas del usuario | Operador | GET /auth/sessions | P1 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-06 | Revocar sesión en otro dispositivo | Operador | DELETE /auth/sessions/{sessionId} | P1 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-07 | Dar de alta cuenta de acceso | Administrador | POST /usuarios | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-08 | Consultar y filtrar cuentas | Administrador | GET /usuarios | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-09 | Modificar o bloquear cuenta | Administrador | PATCH /usuarios/{usuarioId} | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-10 | Listar roles y permisos | Administrador | GET /roles | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-11 | Asignar rol y alcance temporal | Administrador | POST /usuarios/{usuarioId}/roles | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-12 | Revocar asignación de rol | Administrador | DELETE /usuarios/{usuarioId}/roles/{usuarioRolId} | P0 | AC | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-13 | Consultar permisos efectivos de usuario | Administrador | GET /usuarios/{usuarioId}/permisos-efectivos | P0 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | PREPARADO_PARCIAL_NO_PUBLICADO B1; política/repositorio de asignaciones |
| CU-IAM-14 | Consultar matriz de autorizaciones vigente | Autoridad | GET /politicas-autorizacion | P0 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-15 | Aprobar/revisar cambio de matriz de autorización | Jefatura | POST /politicas-autorizacion/versiones | P1 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-IAM-16 | Consultar auditoría de accesos denegados | Auditor | GET /auditorias/accesos | P1 | PROP | DatabaseModule, PolicyEngine y catálogo de ámbitos. | BLOQUEADO_HTTP; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-01 | Listar hospitales visibles | Operador | GET /hospitales | P0 | AC | IAM: ScopeGuard; DatabaseModule. | PREPARADO_NO_PUBLICADO B1; SQL/policy/DTO; QA/identidad pendientes |
| CU-ORG-02 | Crear hospital | Administrador | POST /hospitales | P1 | PROP | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-03 | Editar configuración hospital, huso y estado | Administrador | PATCH /hospitales/{hospitalId} | P0 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-04 | Consultar divisiones por hospital | Operador | GET /hospitales/{hospitalId}/divisiones | P0 | AC | IAM: ScopeGuard; DatabaseModule. | PREPARADO_NO_PUBLICADO B1; SQL/policy/DTO; QA/identidad pendientes |
| CU-ORG-05 | Crear división | Administrador | POST /divisiones | P0 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-06 | Actualizar división | Administrador | PATCH /divisiones/{divisionId} | P0 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-07 | Listar servicios y jerarquía | Operador | GET /servicios | P0 | AC | IAM: ScopeGuard; DatabaseModule. | PREPARADO_NO_PUBLICADO B1; SQL/policy/DTO; QA/identidad pendientes |
| CU-ORG-08 | Crear servicio bajo división | Administrador | POST /servicios | P0 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-09 | Modificar servicio o desactivarlo | Administrador | PATCH /servicios/{servicioId} | P0 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-10 | Listar subáreas por servicio | Operador | GET /servicios/{servicioId}/subareas | P0 | AC | IAM: ScopeGuard; DatabaseModule. | PREPARADO_NO_PUBLICADO B1; SQL/policy/DTO; QA/identidad pendientes |
| CU-ORG-11 | Crear subárea | Administrador | POST /subareas | P1 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-12 | Modificar subárea o desactivarla | Administrador | PATCH /subareas/{subareaId} | P1 | AC | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-ORG-13 | Consultar árbol de organización para filtros | Operador | GET /organizacion/arbol | P0 | PROP | IAM: ScopeGuard; DatabaseModule. | BLOQUEADO/PENDIENTE; clasificación exacta en ALCANCE_B1.md |
| CU-PER-01 | Alta de empleado con RUD único | RRHH | POST /empleados | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-02 | Buscar y paginar padrón por RUD, categoría, estado | RRHH | GET /empleados | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-03 | Consultar expediente laboral | RRHH | GET /empleados/{empleadoId} | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-04 | Actualizar datos no inmutables | RRHH | PATCH /empleados/{empleadoId} | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-05 | Inactivar empleado sin borrado | RRHH | POST /empleados/{empleadoId}/inactivar | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-06 | Registrar contrato base o eventual | RRHH | POST /empleados/{empleadoId}/contratos | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-07 | Consultar historial de contratos | RRHH | GET /empleados/{empleadoId}/contratos | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-08 | Suspender/cerrar contrato con vigencia | RRHH | POST /contratos/{contratoId}/cerrar | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-09 | Registrar cambio histórico de categoría | RRHH | POST /contratos/{contratoId}/cambios-categoria | P1 | PROP | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-10 | Consultar categorías | Operador | GET /categorias | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-11 | Administrar categorías | Administrador | POST /categorias | P1 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-12 | Consultar funciones | Operador | GET /funciones | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-13 | Administrar funciones | Administrador | POST /funciones | P1 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-14 | Consultar competencias | Operador | GET /competencias | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-15 | Administrar competencias | Administrador | POST /competencias | P1 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-16 | Registrar adscripción nominal/operativa | RRHH | POST /contratos/{contratoId}/adscripciones | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-17 | Consultar historial de adscripciones | RRHH | GET /contratos/{contratoId}/adscripciones | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-18 | Asignar función efectiva con vigencia | Jefatura | POST /empleados/{empleadoId}/funciones | P1 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-19 | Validar competencia con vigencia/evidencia | Supervisor | POST /empleados/{empleadoId}/competencias | P0 | AC | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-20 | Consultar competencias vigentes para un intervalo | Coordinación | GET /empleados/{empleadoId}/competencias-vigentes | P0 | PROP | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-21 | Consultar elegibilidad de un empleado para servicio/turno | Coordinación | POST /empleados/{empleadoId}/evaluar-elegibilidad | P0 | PROP | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-PER-22 | Consultar expediente propio restringido | Empleado | GET /mi-expediente | P2 | PROP | IAM, ORG. | PENDIENTE; no implementado en base |
| CU-DOT-01 | Consultar plantilla objetivo del servicio | Jefatura | GET /servicios/{servicioId}/plantilla | P0 | AC | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-02 | Registrar dotación objetivo por categoría/turno | Jefatura | POST /servicios/{servicioId}/plantilla | P0 | AC | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-03 | Versionar/corregir plantilla con vigencia | Jefatura | POST /plantillas/{plantillaId}/versiones | P1 | PROP | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-04 | Consultar brecha plantilla contra personal contratado | Coordinación | GET /servicios/{servicioId}/brecha-plantilla | P0 | PROP | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-05 | Registrar plaza vacante y vigencia | RRHH | POST /plazas-vacantes | P1 | FUT | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-06 | Listar vacantes por hospital/servicio | RRHH | GET /plazas-vacantes | P1 | FUT | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-07 | Programar rotación mensual por subárea | Jefe servicio | POST /rotaciones-subarea | P0 | AC | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-08 | Consultar rotaciones mensuales | Supervisor | GET /rotaciones-subarea | P0 | AC | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-09 | Modificar rotación antes de vigencia | Jefe servicio | PATCH /rotaciones-subarea/{rotacionId} | P0 | AC | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-10 | Validar sumatoria sin doble conteo entre subáreas | Coordinación | GET /servicios/{servicioId}/distribucion | P0 | PROP | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-11 | Comparar plantilla RH y Coordinación | RRHH | GET /conciliaciones/plantilla | P1 | PROP | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-DOT-12 | Emitir observación de conciliación | RRHH | POST /conciliaciones/plantilla/observaciones | P1 | PROP | ORG, PER, CAL. | PENDIENTE; no implementado en base |
| CU-CAL-01 | Listar horarios configurables | Operador | GET /horarios | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-02 | Crear horario autorizado | Administrador | POST /horarios | P1 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-03 | Listar patrones y sus siete días | Operador | GET /patrones-laborales | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-04 | Crear patrón adicional manteniendo vigencia | Administrador | POST /patrones-laborales | P1 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-05 | Asignar patrón de descanso a contrato | RRHH | POST /contratos/{contratoId}/patrones | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-06 | Consultar historial de patrones de contrato | Jefatura | GET /contratos/{contratoId}/patrones | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-07 | Cambiar patrón permanente con aprobación | Jefatura | POST /contratos/{contratoId}/cambiar-patron | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-08 | Listar festivos por hospital | Operador | GET /calendario-festivos | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-09 | Crear festivo oficial hospitalario | Administrador | POST /calendario-festivos | P1 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-10 | Generar calendario laboral desde patrones y contratos | Jefatura | POST /programaciones/generar | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-11 | Simular programación sin persistir | Jefatura | POST /programaciones/simular | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-12 | Consultar programación por servicio, día y turno | Operador | GET /programaciones | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-13 | Consultar programación de empleado | Operador | GET /empleados/{empleadoId}/programaciones | P0 | AC | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-14 | Registrar jornada extraordinaria autorizada | Supervisor | POST /programaciones/extraordinarias | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-15 | Cancelar programación conservando historia | Jefatura | POST /programaciones/{programacionId}/cancelar | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-16 | Validar solapes, vigencias y descanso legal/política | Jefatura | POST /programaciones/validar | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-17 | Publicar rol del periodo con control de versión | Jefatura | POST /programaciones/publicaciones | P1 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-18 | Consultar diferencias entre versión publicada y cambios | Supervisor | GET /programaciones/diferencias | P1 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-19 | Consultar guardias nocturnas fijas y excepciones | Supervisor | GET /programaciones/guardias-nocturnas | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-20 | Programar acumulada en festivo según esquema individual | Jefatura | POST /programaciones/festivos | P1 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-CAL-21 | Previsualizar ausencias conocidas futuras | Coordinación | GET /programaciones/prevision-ausencias | P0 | PROP | ORG, PER, DOT. | PENDIENTE; no implementado en base |
| CU-ASI-01 | Consultar pase de lista del servicio/turno | Jefe servicio | GET /pases-lista | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-02 | Capturar asistencia por jornada | Jefe servicio | PUT /programaciones/{programacionId}/asistencia | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-03 | Capturar lote offline idempotente | Jefe servicio | POST /asistencias/lotes | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-04 | Registrar evento de llegada, salida o corrección | Jefe servicio | POST /asistencias/{asistenciaId}/eventos | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-05 | Marcar ausencia pendiente de justificar | Jefe servicio | POST /asistencias/{asistenciaId}/ausencia | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-06 | Corregir captura conservando evento original | Jefe servicio | POST /asistencias/{asistenciaId}/correcciones | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-07 | Consultar estado actual y eventos | Supervisor | GET /asistencias/{asistenciaId} | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-08 | Validar pase de lista por servicio/turno | Supervisor | POST /pases-lista/{paseListaId}/validar | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-09 | Observar/devolver pase de lista | Supervisor | POST /pases-lista/{paseListaId}/observar | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-10 | Publicar estado validado a Coordinación | Supervisor | POST /pases-lista/{paseListaId}/liberar | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-11 | Ver discrepancia entre presencia hospital e incorporación | Coordinación | GET /asistencias/discrepancias | P1 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-12 | Consultar bitácora de correcciones y autor | Auditor | GET /asistencias/{asistenciaId}/historial | P0 | AC | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-13 | Sincronizar cambios móviles con conflictos | Móvil | POST /sincronizacion/asistencias | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-14 | Consultar estado de solicitudes offline | Móvil | GET /sincronizacion/lotes/{loteId} | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-ASI-15 | Registrar verificación de presencia en Coordinación | Coordinación | POST /presencias-coordinacion | P0 | PROP | PER, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-INC-01 | Consultar catálogo institucional de incidencias | Operador | GET /tipos-incidencia | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-02 | Administrar tipo configurable de incidencia | Administrador | POST /tipos-incidencia | P1 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-03 | Registrar incidencia por periodo | Jefe servicio | POST /incidencias | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-04 | Consultar incidencias con filtros | Supervisor | GET /incidencias | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-05 | Consultar incidencia y versiones | Supervisor | GET /incidencias/{incidenciaId} | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-06 | Relacionar jornadas afectadas | Jefe servicio | POST /incidencias/{incidenciaId}/jornadas | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-07 | Enviar incidencia a revisión | Jefe servicio | POST /incidencias/{incidenciaId}/enviar | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-08 | Autorizar o rechazar con facultad | Autoridad | POST /incidencias/{incidenciaId}/decisiones | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-09 | Adjuntar justificante con hash | Jefe servicio | POST /incidencias/{incidenciaId}/documentos | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-10 | Consultar o descargar justificante autorizado | RRHH | GET /incidencias/{incidenciaId}/documentos/{documentoId} | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-11 | Reclasificar retroactivamente con nueva versión | RRHH | POST /incidencias/{incidenciaId}/reclasificaciones | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-12 | Consultar versiones con fecha efectiva y registro | Auditor | GET /incidencias/{incidenciaId}/versiones | P0 | AC | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-13 | Consultar calendario de incidencias servicio/división | Supervisor | GET /incidencias/calendario | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-14 | Consultar incidencias administrativas vs operativas | RRHH | GET /incidencias/conciliacion | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-15 | Cancelar con motivo sin borrar antecedentes | Autoridad | POST /incidencias/{incidenciaId}/cancelar | P1 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-16 | Generar alertas por vencimientos/documentos faltantes | RRHH | GET /incidencias/alertas | P1 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-17 | Consultar periodo de incapacidad/licencia/vacaciones futuro | Coordinación | GET /incidencias/prevision | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-INC-18 | Emitir reporte de ausentismo por causas y turnos | RRHH | GET /reportes/ausentismo | P0 | PROP | PER, CAL, ASI, IAM. | PENDIENTE; no implementado en base |
| CU-MOV-01 | Solicitar convenio sustitución sin intercambio futuro | Empleado | POST /movimientos/convenios | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-02 | Registrar aceptación del sustituto | Sustituto | POST /movimientos/{movimientoId}/aceptar | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-03 | Consultar convenio y sus jornadas | Supervisor | GET /movimientos/{movimientoId} | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-04 | Revisar elegibilidad del sustituto | Coordinación | POST /movimientos/{movimientoId}/validar-convenio | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-05 | Autorizar/rechazar convenio | Autoridad | POST /movimientos/{movimientoId}/decisiones | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-06 | Aplicar convenio a programaciones de forma atómica | Coordinación | POST /movimientos/{movimientoId}/aplicar | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-07 | Revertir convenio autorizadamente con auditoría | Autoridad | POST /movimientos/{movimientoId}/revertir | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-08 | Solicitar cambio ocasional de descanso | Empleado | POST /movimientos/cambios-descanso | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-09 | Validar y simular nueva jornada/descanso | Supervisor | POST /movimientos/{movimientoId}/simular | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-10 | Aplicar cambio ocasional y conservar patrón | Autoridad | POST /movimientos/{movimientoId}/aplicar-descanso | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-11 | Solicitar pase de salida | Empleado | POST /movimientos/pases-salida | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-12 | Autorizar pase de salida | Autoridad | POST /movimientos/{movimientoId}/decisiones | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-13 | Registrar salida real | Jefe servicio | POST /movimientos/{movimientoId}/registrar-salida | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-14 | Registrar regreso real si se conoce | Jefe servicio | POST /movimientos/{movimientoId}/registrar-regreso | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-15 | Cerrar pase sin regreso confirmado | Supervisor | POST /movimientos/{movimientoId}/cerrar-sin-regreso | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-16 | Cerrar pase sin dato verificado | Supervisor | POST /movimientos/{movimientoId}/cerrar-sin-dato | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-17 | Consultar calidad de evidencia del pase | Supervisor | GET /movimientos/{movimientoId}/evidencia | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-18 | Cancelar/revocar movimiento con efecto histórico | Autoridad | POST /movimientos/{movimientoId}/revocar | P0 | PROP | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-19 | Consultar movimientos por periodo y tipo | Supervisor | GET /movimientos | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-MOV-20 | Consultar eventos/decisiones inmutables | Auditor | GET /movimientos/{movimientoId}/historial | P0 | AC | CAL, PER, IAM, ASI. | PENDIENTE; no implementado en base |
| CU-EVE-01 | Consultar eventuales elegibles con contrato vigente | Coordinación | GET /eventuales | P0 | AC | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-02 | Declarar disponibilidad eventual | Coordinación | POST /eventuales/disponibilidades | P0 | AC | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-03 | Verificar llegada real a Coordinación | Coordinación | POST /eventuales/disponibilidades/{disponibilidadId}/validar-presencia | P0 | AC | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-04 | Marcar indisponible/retiro | Coordinación | POST /eventuales/disponibilidades/{disponibilidadId}/finalizar | P0 | AC | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-05 | Consultar sala de espera por turno y competencias | Coordinación | GET /eventuales/reserva | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-06 | Consultar disponibilidades futuras y compromisos | Coordinación | GET /eventuales/calendario | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-07 | Reservar eventual para déficit previsto | Coordinación | POST /eventuales/preasignaciones | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-08 | Confirmar aceptación de preasignación | Eventual | POST /eventuales/preasignaciones/{preasignacionId}/aceptar | P1 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-09 | Liberar reserva no utilizada | Coordinación | POST /eventuales/preasignaciones/{preasignacionId}/liberar | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-10 | Consultar disponibilidad con conflictos de horario | Coordinación | POST /eventuales/evaluar-disponibilidad | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-11 | Registrar ausencia del eventual preasignado | Jefe servicio | POST /eventuales/preasignaciones/{preasignacionId}/no-presentado | P0 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-EVE-12 | Medir espera y tiempo de asignación | Coordinación | GET /eventuales/metricas-espera | P1 | PROP | PER, CAL, IAM, COB. | PENDIENTE; no implementado en base |
| CU-COB-01 | Detectar déficit según plantilla y demanda | Coordinación | POST /necesidades/evaluar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-02 | Registrar necesidad por ausencia/plaza/complejidad | Supervisor | POST /necesidades-cobertura | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-03 | Consultar necesidades por estado y franja | Coordinación | GET /necesidades-cobertura | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-04 | Consultar detalle y perfil requerido | Coordinación | GET /necesidades-cobertura/{necesidadId} | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-05 | Validar o rechazar necesidad | Supervisor | POST /necesidades-cobertura/{necesidadId}/validar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-06 | Registrar competencias exigidas | Supervisor | PUT /necesidades-cobertura/{necesidadId}/competencias | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-07 | Sugerir candidatos compatibles sin autoasignar | Coordinación | GET /necesidades-cobertura/{necesidadId}/candidatos | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-08 | Simular asignación y efectos en servicio origen | Coordinación | POST /asignaciones/simular | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-09 | Crear asignación habitual/preasignación/reserva | Coordinación | POST /asignaciones-operativas | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-10 | Consultar asignaciones por turno/servicio | Coordinación | GET /asignaciones-operativas | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-11 | Confirmar asignación autorizada | Coordinación | POST /asignaciones-operativas/{asignacionId}/confirmar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-12 | Cancelar asignación con motivo | Coordinación | POST /asignaciones-operativas/{asignacionId}/cancelar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-13 | Verificar recepción real en servicio | Jefe servicio | POST /asignaciones-operativas/{asignacionId}/incorporaciones | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-14 | Confirmar fin efectivo de servicio | Jefe servicio | POST /incorporaciones/{incorporacionId}/finalizar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-15 | Aplicar incorporación a necesidad en intervalo | Coordinación | POST /necesidades-cobertura/{necesidadId}/aplicaciones | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-16 | Anular aplicación errónea conservando traza | Autoridad | POST /aplicaciones-cobertura/{aplicacionId}/anular | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-17 | Consultar déficit efectivo remanente por intervalo | Coordinación | GET /necesidades-cobertura/{necesidadId}/remanente | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-18 | Transferir persona entre servicios con autorización | Supervisor | POST /movimientos-operativos | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-19 | Confirmar recepción en nuevo servicio | Jefe servicio | POST /movimientos-operativos/{movimientoOperativoId}/recepcion | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-20 | Consultar mapa de cobertura consolidado | Coordinación | GET /cobertura/mapa | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-21 | Consultar alertas de duplicidad, competencia e intervalos | Coordinación | GET /cobertura/alertas | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-22 | Cerrar necesidad con déficit no cubierto documentado | Supervisor | POST /necesidades-cobertura/{necesidadId}/cerrar | P0 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-23 | Recalcular semáforo con criterios institucionales vigentes | Coordinación | POST /cobertura/recalcular | P1 | PROP | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-COB-24 | Listar órdenes de movimientos internas del turno | Supervisor | GET /movimientos-operativos | P0 | AC | ORG, PER, CAL, ASI, INC, MOV, EVE, IAM. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-01 | Consultar catálogo de indicadores asistenciales | Supervisor | GET /indicadores-complejidad | P0 | AC | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-02 | Administrar indicador y unidad | Administrador | POST /indicadores-complejidad | P1 | AC | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-03 | Capturar medición por subárea/servicio e instante | Supervisor | POST /mediciones-complejidad | P0 | AC | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-04 | Consultar series de complejidad por turno | Coordinación | GET /mediciones-complejidad | P0 | AC | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-05 | Registrar censo agregado de camas/ocupación | Jefe servicio | POST /censos-camas | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-06 | Consultar censo por servicio/turno | Supervisor | GET /censos-camas | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-07 | Registrar consumo agregado de hemocomponentes | Jefe servicio | POST /productividad/hemocomponentes | P2 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-08 | Registrar productividad quirúrgica | Jefe servicio | POST /productividad/quirofanos | P2 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-09 | Registrar productividad obstétrica | Jefe servicio | POST /productividad/tocoquirurgica | P2 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-10 | Registrar productividad de CEyE/esterilización | Jefe servicio | POST /productividad/esterilizacion | P2 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-11 | Registrar eventos y equipos de soporte asistencial agregados | Jefe servicio | POST /complejidad/eventos | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-12 | Consultar hoja de enlace consolidada por turno | Coordinación | GET /enlaces-turno | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-13 | Capturar/actualizar borrador de enlace | Supervisor | POST /enlaces-turno | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-14 | Validar/firmar cierre de enlace | Coordinación | POST /enlaces-turno/{enlaceId}/validar | P1 | FUT | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-ASI_CLIN-15 | Consultar impacto de demanda sobre necesidades de cobertura | Coordinación | GET /cobertura/justificacion-complejidad | P1 | PROP | ORG, IAM, COB, BAL. | PENDIENTE; no implementado en base |
| CU-BAL-01 | Consultar balance diario por servicio y turno | Supervisor | GET /balances/diarios | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-02 | Consultar balance de personal detallado con renglones | Jefe servicio | GET /balances/diarios/{servicioId}/detalle | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-03 | Previsualizar total programado vs asistencia y necesidades | Supervisor | POST /balances/simular-cierre | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-04 | Emitir cierre operativo versionado inmutable | Supervisor | POST /balances/cierres | P0 | AC | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-05 | Consultar cierres por servicio/fecha | Auditor | GET /balances/cierres | P0 | AC | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-06 | Consultar snapshot exacto emitido | Auditor | GET /balances/cierres/{cierreId} | P0 | AC | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-07 | Emitir rectificación como versión nueva | Autoridad | POST /balances/cierres/{cierreId}/rectificaciones | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-08 | Consultar comparación original y conciliado | RRHH | GET /balances/cierres/{cierreId}/conciliacion | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-09 | Consultar asistencia, faltas, cubiertas y sin cubrir | Coordinación | GET /balances/indicadores | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-10 | Consultar matriz mensual por servicio, día y turno | Jefatura | GET /balances/matriz-mensual | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-11 | Consultar cambios internos/convenios/suplencias | Supervisor | GET /balances/movimientos-resumen | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-12 | Consultar reporte de incidencias pendientes de validar | Jefatura | GET /balances/pendientes | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-13 | Descargar balance PDF con versión/huella | Supervisor | GET /balances/cierres/{cierreId}/pdf | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-14 | Descargar balance CSV/XLSX autorizado | RRHH | GET /balances/cierres/{cierreId}/exportacion | P1 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-15 | Consultar evidencia de correcciones posteriores al corte | Auditor | GET /balances/cierres/{cierreId}/correcciones-posteriores | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-16 | Comparar reporte de turno vs HR/plantilla vigente | RRHH | GET /balances/conciliacion-rh | P1 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-17 | Analizar tasa ausentismo con denominador definido | Jefatura | GET /balances/tasas-ausentismo | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-BAL-18 | Consultar cobertura por fuente y categoría | Coordinación | GET /balances/fuentes-cobertura | P0 | PROP | DOT, CAL, ASI, INC, MOV, EVE, COB, IAM. | PENDIENTE; no implementado en base |
| CU-DOC-01 | Consultar catálogo de tipos de documento administrativo | Jurídico | GET /documentos/tipos | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-02 | Crear borrador de oficio o acta | Supervisor | POST /documentos/actas | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-03 | Consultar actas dentro de jurisdicción | Autoridad | GET /documentos/actas | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-04 | Consultar expediente de acta y participantes | Autoridad | GET /documentos/actas/{actaId} | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-05 | Capturar hechos y testigos con vigencia de rol | Supervisor | PATCH /documentos/actas/{actaId} | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-06 | Adjuntar evidencia minimizada y cifrada | Supervisor | POST /documentos/actas/{actaId}/evidencias | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-07 | Enviar acta a revisión jurídica/jerárquica | Supervisor | POST /documentos/actas/{actaId}/enviar-revision | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-08 | Registrar observaciones y devolución | Autoridad | POST /documentos/actas/{actaId}/revisiones | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-09 | Emitir folio inmutable en transacción autorizada | Autoridad | POST /documentos/actas/{actaId}/emitir | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-10 | Generar PDF/QR de verificación del documento | Autoridad | GET /documentos/actas/{actaId}/pdf | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-11 | Registrar notificación y acuse de enterado | Empleado | POST /documentos/actas/{actaId}/acuses | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-12 | Registrar firmas de testigos sin falsificar firma | Autoridad | POST /documentos/actas/{actaId}/firmas | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-13 | Crear fe de erratas o cancelación enlazada | Jurídico | POST /documentos/actas/{actaId}/correcciones | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-14 | Escalar expediente a RRHH/Jurídico | Jefatura | POST /documentos/actas/{actaId}/escalamientos | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-15 | Levantar cédula de hallazgo de supervisión | Supervisor | POST /supervision-calidad/hallazgos | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-16 | Registrar subsanación/verificación de hallazgo | Supervisor | POST /supervision-calidad/hallazgos/{hallazgoId}/seguimientos | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-DOC-17 | Consultar indicadores de hallazgos no sancionatorios | Jefatura | GET /supervision-calidad/indicadores | P2 | FUT | IAM, INC, AUD, StorageGateway. | PENDIENTE; no implementado en base |
| CU-REP-01 | Dashboard coordinación tiempo real | Coordinación | GET /tableros/coordinacion | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-02 | Dashboard jefatura multi-división | Jefatura | GET /tableros/jefatura | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-03 | Dashboard supervisor por división | Supervisor | GET /tableros/supervision | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-04 | Reportar déficit por servicio/turno | Jefatura | GET /reportes/deficits | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-05 | Reportar tiempos de cobertura y esperas | Jefatura | GET /reportes/tiempos-cobertura | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-06 | Reportar cobertura efectiva vs asignaciones | Coordinación | GET /reportes/cobertura-efectiva | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-07 | Reportar movimientos internos/convenios/pases | Jefatura | GET /reportes/movimientos | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-08 | Reportar incidencias por causa/periodo | RRHH | GET /reportes/incidencias | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-09 | Reportar vencimiento de contratos/competencias | RRHH | GET /reportes/vencimientos | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-10 | Reportar demanda/ocupación y complejidad | Jefatura | GET /reportes/carga-asistencial | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-11 | Exportar reporte autorizado a PDF | Jefatura | POST /reportes/exportaciones | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-12 | Consultar estado de exportación asíncrona | Jefatura | GET /reportes/exportaciones/{exportacionId} | P1 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-REP-13 | Consultar diccionario de KPIs y fórmulas vigentes | Auditor | GET /indicadores/definiciones | P0 | PROP | BAL, COB, INC, ASI_CLIN, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-01 | Registrar fuente de datos y esquema de columnas | Administrador | POST /migraciones/fuentes | P1 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-02 | Subir archivo CSV/XLSX para staging | Administrador | POST /migraciones/lotes | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-03 | Consultar mapeo de columnas y tipos | Administrador | GET /migraciones/lotes/{loteId}/mapeo | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-04 | Configurar mapeo de RUD, categoría, turno, descanso | Administrador | PUT /migraciones/lotes/{loteId}/mapeo | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-05 | Prevalidar lotes sin persistencia final | Administrador | POST /migraciones/lotes/{loteId}/prevalidar | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-06 | Consultar errores y duplicados | Administrador | GET /migraciones/lotes/{loteId}/errores | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-07 | Simular consolidación entre plantillas RH y Coordinación | RRHH | POST /migraciones/lotes/{loteId}/simular | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-08 | Confirmar importación transaccional e idempotente | Administrador | POST /migraciones/lotes/{loteId}/aplicar | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-09 | Consultar bitácora, versión fuente y huella | Auditor | GET /migraciones/lotes/{loteId} | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-10 | Revertir mediante operación compensatoria | Administrador | POST /migraciones/lotes/{loteId}/revertir | P1 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-11 | Exportar discrepancias de conciliación | RRHH | GET /migraciones/lotes/{loteId}/discrepancias | P1 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-12 | Registrar lote histórico de balances sin adjudicar semántica | Administrador | POST /migraciones/balances-historicos | P1 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-MIG-13 | Mapear códigos de motivos de ausencia heredados | RRHH | POST /migraciones/catalogos-incidencia | P0 | FUT | ORG, PER, DOT, CAL, IAM. | PENDIENTE; no implementado en base |
| CU-NOT-01 | Consultar notificaciones de usuario | Operador | GET /notificaciones | P1 | FUT | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-NOT-02 | Marcar notificación como leída | Operador | POST /notificaciones/{notificacionId}/leer | P1 | FUT | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-NOT-03 | Configurar preferencias de aviso | Operador | PUT /notificaciones/preferencias | P2 | FUT | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-NOT-04 | Registrar token push móvil con consentimiento | Móvil | POST /notificaciones/dispositivos | P1 | FUT | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-NOT-05 | Registrar entrega/fallo de notificación | Sistema | POST /notificaciones/entregas | P2 | FUT | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-NOT-06 | Obtener snapshot tras reconexión de WebSocket | Operador | GET /eventos/snapshot | P0 | PROP | IAM, BAL, COB, ASI, MOV. | PENDIENTE; no implementado en base |
| CU-AUD-01 | Consultar auditoría filtrada por ámbito y acción | Auditor | GET /auditorias | P0 | AC | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-02 | Consultar trazabilidad de registro por entidad | Auditor | GET /auditorias/entidades/{tipo}/{id} | P0 | PROP | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-03 | Consultar decisiones y eventos históricos | Auditor | GET /auditorias/decisiones | P0 | PROP | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-04 | Exportar evidencia de operación con hash | Auditor | POST /auditorias/exportaciones | P1 | PROP | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-05 | Reportar intento de acceso fuera de ámbito | Sistema | POST /seguridad/incidentes | P1 | PROP | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-06 | Ver políticas efectivas por hospital/servicio | Auditor | GET /seguridad/politicas | P0 | PROP | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-07 | Consultar estado de retención y bloqueo legal | Jurídico | GET /seguridad/retencion | P2 | FUT | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-AUD-08 | Registrar solicitud de rectificación de datos personales | RRHH | POST /privacidad/solicitudes | P2 | FUT | IAM, todos los módulos. | PENDIENTE; no implementado en base |
| CU-OPS-01 | Health básico de API | Infra | GET /health/live | P0 | PROP | DatabaseModule, IAM, observabilidad. | BASE_EXISTENTE; estado detallado en AVANCE_FUNCIONAL |
| CU-OPS-02 | Readiness PostgreSQL y colas | Infra | GET /health/ready | P0 | PROP | DatabaseModule, IAM, observabilidad. | BASE_EXISTENTE; estado detallado en AVANCE_FUNCIONAL |
| CU-OPS-03 | Consultar versión de contrato API | Desarrollador | GET /meta/version | P0 | PROP | DatabaseModule, IAM, observabilidad. | BACKEND_IMPLEMENTADO; HTTP real sin BD verificado |
| CU-OPS-04 | Sincronizar lotes de comandos offline con idempotencia | Móvil | POST /sync/lotes | P0 | PROP | DatabaseModule, IAM, observabilidad. | PENDIENTE; no implementado en base |
| CU-OPS-05 | Obtener cambios autorizados desde cursor | Móvil | GET /sync/cambios | P0 | PROP | DatabaseModule, IAM, observabilidad. | PENDIENTE; no implementado en base |
| CU-OPS-06 | Consultar resultado de operación por clave idempotencia | Móvil | GET /operaciones/{operacionId} | P0 | PROP | DatabaseModule, IAM, observabilidad. | PENDIENTE; no implementado en base |
| CU-OPS-07 | Consultar catálogos incrementales para móvil | Móvil | GET /sync/catalogos | P0 | PROP | DatabaseModule, IAM, observabilidad. | PENDIENTE; no implementado en base |
| CU-OPS-08 | Consultar resumen de lag de sincronización | Infra | GET /ops/sync-metricas | P1 | PROP | DatabaseModule, IAM, observabilidad. | PENDIENTE; no implementado en base |
