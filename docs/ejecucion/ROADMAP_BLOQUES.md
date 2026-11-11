# Roadmap de bloques verticales

Plan técnico; no convierte PROP/FUT en alcance aprobado. Cada lote real selecciona fichas y DoR de sus CU; un bloque grande puede necesitar varios commits cohesionados. Las rutas listadas son PROPUESTAS salvo las acreditadas en AVANCE_FUNCIONAL.md. Matriz completa por CU: MATRIZ_CU_DEPENDENCIAS.md.

Camino crítico: QA+identidad autorizadas → ámbito/vigencia persistidos → ORG/PER → catálogos CAL/DOT → programación → asistencia/incidencias/movimientos → reserva/incorporación/cobertura → cierre/reporte. Angular se integra dentro de cada flujo al disponer de API protegida; Android empieza por lectura de pase y luego sincronización aprobada. No se construyen UI de negocio ni endpoints abiertos con datos ficticios como sustituto de IAM.

Seguridad transversal: deny-by-default, tablas calificadas sigeh., transacciones en mismo cliente, locks con orden estable, sin reintentar COMMIT incierto; REST snapshot autorizado tras señales WS. Pruebas SQL reales únicamente en QA autorizada.

## B0 — Operabilidad y contrato sin BD

CU oficiales (3): CU-OPS-01, CU-OPS-02, CU-OPS-03.

Dependencias/decisiones: Ninguna para OPS-03. OPS-02 real requiere QA autorizada.

Criterio de aceptación: Versión coincide con OpenAPI; liveness sin BD; HTTP y docs verificados; readiness SQL solo con evidencia real.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| OPS | `sin tabla propia obligatoria; inbox/idempotencia/sync V2`. | Página de estado/errores de sincronización solo para soporte, dashboard de tareas fallidas, historial de deploy sin datos personales. | Room + WorkManager; cola de cambios con clientEventId y versión, barra sincronización y resolución de conflictos por elemento; token vencido detiene sincronización y pide re-login. | Pérdida red, 30 eventos reintentados sin duplicación, DB caída -> 503, reinicio y replay, límite tamaños de lote y acceso a docs. Falta modelo SQL de inbox/idempotencia, jobs y outbox. Despliegue TI intranet debe validarse. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-OPS-01`: `GET /health/live` — P0/PROP.
- `CU-OPS-02`: `GET /health/ready` — P0/PROP.
- `CU-OPS-03`: `GET /meta/version` — P0/PROP.

## B1 — Identidad, autorización y organización visible

CU oficiales (21): CU-IAM-01, CU-IAM-02, CU-IAM-03, CU-IAM-04, CU-IAM-05, CU-IAM-06, CU-IAM-07, CU-IAM-08, CU-IAM-09, CU-IAM-10, CU-IAM-11, CU-IAM-12, CU-IAM-13, CU-IAM-14, CU-IAM-15, CU-IAM-16, CU-ORG-01, CU-ORG-04, CU-ORG-07, CU-ORG-10, CU-ORG-13.

Dependencias/decisiones: DEC-E01/E02; roles/ámbitos/facultades persistidos y matriz aprobada.

Criterio de aceptación: Login/refresh/logout/me reales, revocación y vigencias; 401/403/404; usuario A no accede a hospital B; credenciales/sesiones solo por mecanismo aprobado.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| IAM | `usuarios, roles, permisos, rol_permisos, usuario_roles`. | Login, selector de hospital si tiene más de uno, menú según permisos, administración de roles con vigencias y comparación de atribuciones. Nunca ofrecer acciones no permitidas como botones activos; protección real permanece en backend. | Pantalla login; selección de servicio/ámbito, caducidad de credenciales, bloqueo de acciones offline si el permiso ya caducó; no cachear tokens en preferencias no cifradas. | 401 sin sesión, 403 hospital ajeno, rol expirado, escalamiento de privilegios, revocación en tiempo real, acceso a recurso de tercero por ID. Tabla `usuarios` y permiso V1 no son un proveedor completo de identidad; falta definir IdP, refresh y política RLS. |
| ORG | `hospitales, divisiones, servicios, subareas`. | Configuración arbolada + tabla; breadcrumbs hospital/división/servicio; alta/inactivación con confirmación y aviso si hay dependencias. | Selector sólo de servicios autorizados; persistir último ámbito mientras token válido. Sin edición organizacional. | Intentar insertar servicio con division de otro hospital, consultar subárea ajena, desactivar servicio con programación vigente. Autoridad orgánica e inactivación con dependencias necesitan reglas formales. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-IAM-01`: `POST /auth/login` — P0/AC.
- `CU-IAM-02`: `POST /auth/refresh` — P0/AC.
- `CU-IAM-03`: `POST /auth/logout` — P0/AC.
- `CU-IAM-04`: `GET /auth/me` — P0/AC.
- `CU-IAM-05`: `GET /auth/sessions` — P1/PROP.
- `CU-IAM-06`: `DELETE /auth/sessions/{sessionId}` — P1/PROP.
- `CU-IAM-07`: `POST /usuarios` — P0/AC.
- `CU-IAM-08`: `GET /usuarios` — P0/AC.
- `CU-IAM-09`: `PATCH /usuarios/{usuarioId}` — P0/AC.
- `CU-IAM-10`: `GET /roles` — P0/AC.
- `CU-IAM-11`: `POST /usuarios/{usuarioId}/roles` — P0/AC.
- `CU-IAM-12`: `DELETE /usuarios/{usuarioId}/roles/{usuarioRolId}` — P0/AC.
- `CU-IAM-13`: `GET /usuarios/{usuarioId}/permisos-efectivos` — P0/PROP.
- `CU-IAM-14`: `GET /politicas-autorizacion` — P0/PROP.
- `CU-IAM-15`: `POST /politicas-autorizacion/versiones` — P1/PROP.
- `CU-IAM-16`: `GET /auditorias/accesos` — P1/PROP.
- `CU-ORG-01`: `GET /hospitales` — P0/AC.
- `CU-ORG-04`: `GET /hospitales/{hospitalId}/divisiones` — P0/AC.
- `CU-ORG-07`: `GET /servicios` — P0/AC.
- `CU-ORG-10`: `GET /servicios/{servicioId}/subareas` — P0/AC.
- `CU-ORG-13`: `GET /organizacion/arbol` — P0/PROP.

## B2 — Organización y personal

CU oficiales (30): CU-ORG-02, CU-ORG-03, CU-ORG-05, CU-ORG-06, CU-ORG-08, CU-ORG-09, CU-ORG-11, CU-ORG-12, CU-PER-01, CU-PER-02, CU-PER-03, CU-PER-04, CU-PER-05, CU-PER-06, CU-PER-07, CU-PER-08, CU-PER-09, CU-PER-10, CU-PER-11, CU-PER-12, CU-PER-13, CU-PER-14, CU-PER-15, CU-PER-16, CU-PER-17, CU-PER-18, CU-PER-19, CU-PER-20, CU-PER-21, CU-PER-22.

Dependencias/decisiones: B1 y QA aislada; autoridad para altas/inactivaciones.

Criterio de aceptación: Alta→consulta→contrato→adscripción con FK real, scope y auditoría; duplicados 409; formulario Angular conectado y expediente limitado.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| ORG | `hospitales, divisiones, servicios, subareas`. | Configuración arbolada + tabla; breadcrumbs hospital/división/servicio; alta/inactivación con confirmación y aviso si hay dependencias. | Selector sólo de servicios autorizados; persistir último ámbito mientras token válido. Sin edición organizacional. | Intentar insertar servicio con division de otro hospital, consultar subárea ajena, desactivar servicio con programación vigente. Autoridad orgánica e inactivación con dependencias necesitan reglas formales. |
| PER | `empleados, contratos, categorias, funciones, competencias, adscripciones, empleado_funciones, empleado_competencias`. | Padrón con filtros RUD/categoría/contrato/servicio; ficha en pestañas Personal, Contratos, Adscripciones, Funciones, Competencias, Historial. Validadores y confirmaciones. | Ficha mínima de empleado programado por servicio con información indispensable; no exponer datos completos del expediente laboral. | RUD duplicado, contrato fuera de vigencia, acceso a empleado por identificador cruzado, competencia vencida, categoría nominal no equivale a acreditación. Historial de categorías y almacenamiento de evidencia sensible requieren V2. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-ORG-02`: `POST /hospitales` — P1/PROP.
- `CU-ORG-03`: `PATCH /hospitales/{hospitalId}` — P0/AC.
- `CU-ORG-05`: `POST /divisiones` — P0/AC.
- `CU-ORG-06`: `PATCH /divisiones/{divisionId}` — P0/AC.
- `CU-ORG-08`: `POST /servicios` — P0/AC.
- `CU-ORG-09`: `PATCH /servicios/{servicioId}` — P0/AC.
- `CU-ORG-11`: `POST /subareas` — P1/AC.
- `CU-ORG-12`: `PATCH /subareas/{subareaId}` — P1/AC.
- `CU-PER-01`: `POST /empleados` — P0/AC.
- `CU-PER-02`: `GET /empleados` — P0/AC.
- `CU-PER-03`: `GET /empleados/{empleadoId}` — P0/AC.
- `CU-PER-04`: `PATCH /empleados/{empleadoId}` — P0/AC.
- `CU-PER-05`: `POST /empleados/{empleadoId}/inactivar` — P0/AC.
- `CU-PER-06`: `POST /empleados/{empleadoId}/contratos` — P0/AC.
- `CU-PER-07`: `GET /empleados/{empleadoId}/contratos` — P0/AC.
- `CU-PER-08`: `POST /contratos/{contratoId}/cerrar` — P0/AC.
- `CU-PER-09`: `POST /contratos/{contratoId}/cambios-categoria` — P1/PROP.
- `CU-PER-10`: `GET /categorias` — P0/AC.
- `CU-PER-11`: `POST /categorias` — P1/AC.
- `CU-PER-12`: `GET /funciones` — P0/AC.
- `CU-PER-13`: `POST /funciones` — P1/AC.
- `CU-PER-14`: `GET /competencias` — P0/AC.
- `CU-PER-15`: `POST /competencias` — P1/AC.
- `CU-PER-16`: `POST /contratos/{contratoId}/adscripciones` — P0/AC.
- `CU-PER-17`: `GET /contratos/{contratoId}/adscripciones` — P0/AC.
- `CU-PER-18`: `POST /empleados/{empleadoId}/funciones` — P1/AC.
- `CU-PER-19`: `POST /empleados/{empleadoId}/competencias` — P0/AC.
- `CU-PER-20`: `GET /empleados/{empleadoId}/competencias-vigentes` — P0/PROP.
- `CU-PER-21`: `POST /empleados/{empleadoId}/evaluar-elegibilidad` — P0/PROP.
- `CU-PER-22`: `GET /mi-expediente` — P2/PROP.

## B3 — Programación y dotación

CU oficiales (33): CU-DOT-01, CU-DOT-02, CU-DOT-03, CU-DOT-04, CU-DOT-05, CU-DOT-06, CU-DOT-07, CU-DOT-08, CU-DOT-09, CU-DOT-10, CU-DOT-11, CU-DOT-12, CU-CAL-01, CU-CAL-02, CU-CAL-03, CU-CAL-04, CU-CAL-05, CU-CAL-06, CU-CAL-07, CU-CAL-08, CU-CAL-09, CU-CAL-10, CU-CAL-11, CU-CAL-12, CU-CAL-13, CU-CAL-14, CU-CAL-15, CU-CAL-16, CU-CAL-17, CU-CAL-18, CU-CAL-19, CU-CAL-20, CU-CAL-21.

Dependencias/decisiones: B1/B2. Catálogos CAL→objetivos DOT→simulación/publicación CAL rompe ciclo de módulos.

Criterio de aceptación: Simular→publicar→consultar agenda; guardias fijas cruzan fecha; descansos/alias/festivo; EXCLUDE y carreras probadas; dotación no duplicada por subárea.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| DOT | `plantilla_servicio, rotaciones_subarea`. | Matriz de plantilla objetivo vs nominal/operativa por servicios, editor de rotaciones por mes y vista de diferencias/pendientes de RH. | Consulta del personal que corresponde al servicio/subárea del turno, no editor masivo de plantilla. | Contar una sola vez al mismo empleado presente en servicio aunque cambie subárea, rotación de subárea de otro servicio, solapamiento mensual. Plaza vacante estructural necesita entidad propia/migración; no registrarla como falsa ausencia. |
| CAL | `horarios, patrones_laborales, patron_dias, empleado_patrones, calendario_festivos, programacion_laboral`. | Calendario mensual/semanal por servicio y empleado, indicador programado vs descanso vs festivo, asistente Simular/Validar/Publicar con comparación antes/después. | Agenda del turno/día + estado de publicación. No mostrar fechas no programadas como falta; ver actualización luego de convenio/cambio descanso. | DL entre semanas, LMiV fijo, guardia que cruza día, los patrones administrativos con mismos días mantienen código, eventual festivo en turno habitual, inserción de dos jornadas solapadas. Generador de programación, publicación versionada y horas particulares exigen política de transiciones adicional; no asumir que todo trabajador de JA labora todos los festivos. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-DOT-01`: `GET /servicios/{servicioId}/plantilla` — P0/AC.
- `CU-DOT-02`: `POST /servicios/{servicioId}/plantilla` — P0/AC.
- `CU-DOT-03`: `POST /plantillas/{plantillaId}/versiones` — P1/PROP.
- `CU-DOT-04`: `GET /servicios/{servicioId}/brecha-plantilla` — P0/PROP.
- `CU-DOT-05`: `POST /plazas-vacantes` — P1/FUT.
- `CU-DOT-06`: `GET /plazas-vacantes` — P1/FUT.
- `CU-DOT-07`: `POST /rotaciones-subarea` — P0/AC.
- `CU-DOT-08`: `GET /rotaciones-subarea` — P0/AC.
- `CU-DOT-09`: `PATCH /rotaciones-subarea/{rotacionId}` — P0/AC.
- `CU-DOT-10`: `GET /servicios/{servicioId}/distribucion` — P0/PROP.
- `CU-DOT-11`: `GET /conciliaciones/plantilla` — P1/PROP.
- `CU-DOT-12`: `POST /conciliaciones/plantilla/observaciones` — P1/PROP.
- `CU-CAL-01`: `GET /horarios` — P0/AC.
- `CU-CAL-02`: `POST /horarios` — P1/AC.
- `CU-CAL-03`: `GET /patrones-laborales` — P0/AC.
- `CU-CAL-04`: `POST /patrones-laborales` — P1/AC.
- `CU-CAL-05`: `POST /contratos/{contratoId}/patrones` — P0/AC.
- `CU-CAL-06`: `GET /contratos/{contratoId}/patrones` — P0/AC.
- `CU-CAL-07`: `POST /contratos/{contratoId}/cambiar-patron` — P0/PROP.
- `CU-CAL-08`: `GET /calendario-festivos` — P0/AC.
- `CU-CAL-09`: `POST /calendario-festivos` — P1/AC.
- `CU-CAL-10`: `POST /programaciones/generar` — P0/PROP.
- `CU-CAL-11`: `POST /programaciones/simular` — P0/PROP.
- `CU-CAL-12`: `GET /programaciones` — P0/AC.
- `CU-CAL-13`: `GET /empleados/{empleadoId}/programaciones` — P0/AC.
- `CU-CAL-14`: `POST /programaciones/extraordinarias` — P0/PROP.
- `CU-CAL-15`: `POST /programaciones/{programacionId}/cancelar` — P0/PROP.
- `CU-CAL-16`: `POST /programaciones/validar` — P0/PROP.
- `CU-CAL-17`: `POST /programaciones/publicaciones` — P1/PROP.
- `CU-CAL-18`: `GET /programaciones/diferencias` — P1/PROP.
- `CU-CAL-19`: `GET /programaciones/guardias-nocturnas` — P0/PROP.
- `CU-CAL-20`: `POST /programaciones/festivos` — P1/PROP.
- `CU-CAL-21`: `GET /programaciones/prevision-ausencias` — P0/PROP.

## B4 — Asistencia, incidencias y movimientos

CU oficiales (53): CU-ASI-01, CU-ASI-02, CU-ASI-03, CU-ASI-04, CU-ASI-05, CU-ASI-06, CU-ASI-07, CU-ASI-08, CU-ASI-09, CU-ASI-10, CU-ASI-11, CU-ASI-12, CU-ASI-13, CU-ASI-14, CU-ASI-15, CU-INC-01, CU-INC-02, CU-INC-03, CU-INC-04, CU-INC-05, CU-INC-06, CU-INC-07, CU-INC-08, CU-INC-09, CU-INC-10, CU-INC-11, CU-INC-12, CU-INC-13, CU-INC-14, CU-INC-15, CU-INC-16, CU-INC-17, CU-INC-18, CU-MOV-01, CU-MOV-02, CU-MOV-03, CU-MOV-04, CU-MOV-05, CU-MOV-06, CU-MOV-07, CU-MOV-08, CU-MOV-09, CU-MOV-10, CU-MOV-11, CU-MOV-12, CU-MOV-13, CU-MOV-14, CU-MOV-15, CU-MOV-16, CU-MOV-17, CU-MOV-18, CU-MOV-19, CU-MOV-20.

Dependencias/decisiones: B1/B3; autoridad para validar/aplicar y documentos protegidos; sync robusta condicionada B7/V2.

Criterio de aceptación: Pase→captura→validación→incidencia/movimiento; PENDIENTE no falta; convenio no recíproco, pase sin regreso, retroclasificación no altera cierre/eventos.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| ASI | `programacion_laboral, registros_asistencia, eventos_asistencia`. | Panel pase de lista con estado Pendiente/Presente/Ausente/Parcial/No exigible, observaciones, validación por supervisión y auditoría de cambios. Bloquear cierre con pendientes o exigir política explícita. | Pantalla central Compose lista del personal programado, botones grandes Presente/Ausente/Parcial, motivo opcional, guardar offline en Room, iconos Pendiente local/Sincronizado/Conflicto; no inventar confirmación de servidor. | Dos capturas en paralelo, lote repetido, revocación de rol offline, faltas no declaradas por celda vacía, horario sin programación, validación por usuario no autorizado. Falta tabla de lote/inbox para idempotencia offline y entidad de pase cerrado; diseñar V2 si el ciclo de lote no cabe en V1. |
| INC | `tipos_incidencia, incidencias, incidencia_jornadas, incidencia_versiones, incidencia_autorizaciones, incidencia_documentos`. | Calendario mes/día con filtros por servicio/tipo/estado, panel de incidencia y línea temporal operativa vs administrativa; aprobaciones por rol y conciliación posterior al cierre. | Capturar incidencia ligada a jornada, mostrar estado y evidencia mínima, cola offline sólo para registro preliminar, sin autorizar retrospectivamente offline. | Licencia posterior cambia clasificación administrativa sin alterar `cierres_balance`; actor no autorizado no reclasifica; incidencia de otro hospital rechazada; periodos parciales válidos. Versión automática de cada edición y autorización documental necesitan orquestación y quizá V2. |
| MOV | `movimientos_laborales, movimiento_decisiones, movimiento_eventos, convenios_sustitucion, cambios_descanso, pases_salida, efectos_programacion_movimiento`. | Bandeja de solicitudes con tipo/estado, formularios por tipo, vista de calendario antes/después, línea de tiempo de decisiones, aprobación separada y estado del pase. | Solicitar pase/consultar convenio; registrar hora real de salida, opcional regreso, indicador No verificado; posible aceptación del sustituto; no exponer acciones de aprobación sin facultad. | Convenio sin reciprocidad, sustituto con jornada solapada, aplicación repetida, cambio de descanso mismo día ocupado, pase sin regreso, regreso anterior a salida. Autorización completa por ámbito y atomicidad de aplicación requieren use cases; estados V1 con reglas pendientes de validar. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-ASI-01`: `GET /pases-lista` — P0/AC.
- `CU-ASI-02`: `PUT /programaciones/{programacionId}/asistencia` — P0/AC.
- `CU-ASI-03`: `POST /asistencias/lotes` — P0/PROP.
- `CU-ASI-04`: `POST /asistencias/{asistenciaId}/eventos` — P0/AC.
- `CU-ASI-05`: `POST /asistencias/{asistenciaId}/ausencia` — P0/AC.
- `CU-ASI-06`: `POST /asistencias/{asistenciaId}/correcciones` — P0/PROP.
- `CU-ASI-07`: `GET /asistencias/{asistenciaId}` — P0/AC.
- `CU-ASI-08`: `POST /pases-lista/{paseListaId}/validar` — P0/PROP.
- `CU-ASI-09`: `POST /pases-lista/{paseListaId}/observar` — P0/PROP.
- `CU-ASI-10`: `POST /pases-lista/{paseListaId}/liberar` — P0/PROP.
- `CU-ASI-11`: `GET /asistencias/discrepancias` — P1/PROP.
- `CU-ASI-12`: `GET /asistencias/{asistenciaId}/historial` — P0/AC.
- `CU-ASI-13`: `POST /sincronizacion/asistencias` — P0/PROP.
- `CU-ASI-14`: `GET /sincronizacion/lotes/{loteId}` — P0/PROP.
- `CU-ASI-15`: `POST /presencias-coordinacion` — P0/PROP.
- `CU-INC-01`: `GET /tipos-incidencia` — P0/AC.
- `CU-INC-02`: `POST /tipos-incidencia` — P1/AC.
- `CU-INC-03`: `POST /incidencias` — P0/AC.
- `CU-INC-04`: `GET /incidencias` — P0/AC.
- `CU-INC-05`: `GET /incidencias/{incidenciaId}` — P0/AC.
- `CU-INC-06`: `POST /incidencias/{incidenciaId}/jornadas` — P0/AC.
- `CU-INC-07`: `POST /incidencias/{incidenciaId}/enviar` — P0/PROP.
- `CU-INC-08`: `POST /incidencias/{incidenciaId}/decisiones` — P0/AC.
- `CU-INC-09`: `POST /incidencias/{incidenciaId}/documentos` — P0/AC.
- `CU-INC-10`: `GET /incidencias/{incidenciaId}/documentos/{documentoId}` — P0/PROP.
- `CU-INC-11`: `POST /incidencias/{incidenciaId}/reclasificaciones` — P0/PROP.
- `CU-INC-12`: `GET /incidencias/{incidenciaId}/versiones` — P0/AC.
- `CU-INC-13`: `GET /incidencias/calendario` — P0/PROP.
- `CU-INC-14`: `GET /incidencias/conciliacion` — P0/PROP.
- `CU-INC-15`: `POST /incidencias/{incidenciaId}/cancelar` — P1/PROP.
- `CU-INC-16`: `GET /incidencias/alertas` — P1/PROP.
- `CU-INC-17`: `GET /incidencias/prevision` — P0/PROP.
- `CU-INC-18`: `GET /reportes/ausentismo` — P0/PROP.
- `CU-MOV-01`: `POST /movimientos/convenios` — P0/AC.
- `CU-MOV-02`: `POST /movimientos/{movimientoId}/aceptar` — P0/PROP.
- `CU-MOV-03`: `GET /movimientos/{movimientoId}` — P0/AC.
- `CU-MOV-04`: `POST /movimientos/{movimientoId}/validar-convenio` — P0/PROP.
- `CU-MOV-05`: `POST /movimientos/{movimientoId}/decisiones` — P0/AC.
- `CU-MOV-06`: `POST /movimientos/{movimientoId}/aplicar` — P0/PROP.
- `CU-MOV-07`: `POST /movimientos/{movimientoId}/revertir` — P0/PROP.
- `CU-MOV-08`: `POST /movimientos/cambios-descanso` — P0/AC.
- `CU-MOV-09`: `POST /movimientos/{movimientoId}/simular` — P0/PROP.
- `CU-MOV-10`: `POST /movimientos/{movimientoId}/aplicar-descanso` — P0/PROP.
- `CU-MOV-11`: `POST /movimientos/pases-salida` — P0/AC.
- `CU-MOV-12`: `POST /movimientos/{movimientoId}/decisiones` — P0/AC.
- `CU-MOV-13`: `POST /movimientos/{movimientoId}/registrar-salida` — P0/PROP.
- `CU-MOV-14`: `POST /movimientos/{movimientoId}/registrar-regreso` — P0/PROP.
- `CU-MOV-15`: `POST /movimientos/{movimientoId}/cerrar-sin-regreso` — P0/PROP.
- `CU-MOV-16`: `POST /movimientos/{movimientoId}/cerrar-sin-dato` — P0/PROP.
- `CU-MOV-17`: `GET /movimientos/{movimientoId}/evidencia` — P0/PROP.
- `CU-MOV-18`: `POST /movimientos/{movimientoId}/revocar` — P0/PROP.
- `CU-MOV-19`: `GET /movimientos` — P0/AC.
- `CU-MOV-20`: `GET /movimientos/{movimientoId}/historial` — P0/AC.

## B5 — Eventuales, cobertura y balances

CU oficiales (54): CU-EVE-01, CU-EVE-02, CU-EVE-03, CU-EVE-04, CU-EVE-05, CU-EVE-06, CU-EVE-07, CU-EVE-08, CU-EVE-09, CU-EVE-10, CU-EVE-11, CU-EVE-12, CU-COB-01, CU-COB-02, CU-COB-03, CU-COB-04, CU-COB-05, CU-COB-06, CU-COB-07, CU-COB-08, CU-COB-09, CU-COB-10, CU-COB-11, CU-COB-12, CU-COB-13, CU-COB-14, CU-COB-15, CU-COB-16, CU-COB-17, CU-COB-18, CU-COB-19, CU-COB-20, CU-COB-21, CU-COB-22, CU-COB-23, CU-COB-24, CU-BAL-01, CU-BAL-02, CU-BAL-03, CU-BAL-04, CU-BAL-05, CU-BAL-06, CU-BAL-07, CU-BAL-08, CU-BAL-09, CU-BAL-10, CU-BAL-11, CU-BAL-12, CU-BAL-13, CU-BAL-14, CU-BAL-15, CU-BAL-16, CU-BAL-17, CU-BAL-18.

Dependencias/decisiones: B1–B4; matriz competencial; política de déficit, locks y requisitos V2 revisados por CU.

Criterio de aceptación: Proceso FC-02 completo: necesidad→reserva→asignación→recepción→cobertura→cierre; dos coordinadores no duplican ni exceden unidades; snapshot inmutable y conciliación diferenciada.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| EVE | `disponibilidad_eventual, contratos, asignaciones_operativas`. | Tablero de reserva por turno, disponibilidad con filtro de perfil/servicio, cronología de llegada, preasignados vs libres, estados y alertas. | Ficha del eventual/consulta de asignación y confirmación operativa por autoridad; ubicación GPS no requerida; no activar auto-presencia desde smartphone. | Persona solo declarada no asignable como presencia física verificada cuando se requiere; contrato no vigente; doble reserva incompatibles; ausencia de prueba de incorporación. Proceso oficial de confirmación de llegada a coordinación y vínculo previo necesidad/asignación todavía requiere decisión/migración V2. |
| COB | `necesidades_cobertura, necesidad_competencias, asignaciones_operativas, incorporaciones_servicio, aplicaciones_cobertura, movimientos_operativos`. | Tablero de semáforo por servicio, lista necesidad/candidatos, arrastrar-soltar SOLO como interfaz (envía comando POST), modal con decisión y conflictos, evidencia de recibo en servicio, parciales y no cubiertas. | Recepción de eventual en servicio por jefe, confirmación de inicio efectivo, rechazo motivado, vista asignación propia; no declarar cobertura por ver solo una tarjeta. | Dos coordinadores asignan mismo eventual simultáneamente, necesidad 2/persona 1=parcial, cobertura fuera de incorporación, traslado genera déficit origen, ausencia sin déficit adicional. DDL V1 no impide todos los solapes de asignaciones ni exceso global de `aplicaciones_cobertura`; requerirá bloqueo transaccional + restricciones/migración V2. |
| BAL | `cierres_balance, registros_asistencia, incidencias, aplicaciones_cobertura, movimientos_laborales`. | Matriz día/turno/servicio, filas parecidas al balance heredado pero con estado por separado y responsable, diferencias reales vs programadas, semáforo y acciones emitir/rectificar; exportar PDF bajo rol. | Resumen del pase enviado, discrepancias y estado de validación; lectura de balance acotado de su servicio. No edición del cierre. | Reclaseficiar no cambia JSONB histórico; cubierta + remanente = necesidad por perfil/intervalo; reposo no es falta; PDF mismo cierre/versión genera mismo contenido lógico. Ratios, tasas y denominadores heredados requieren decisión explícita y test de regresión; motor SQL reportes aún no existe. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-EVE-01`: `GET /eventuales` — P0/AC.
- `CU-EVE-02`: `POST /eventuales/disponibilidades` — P0/AC.
- `CU-EVE-03`: `POST /eventuales/disponibilidades/{disponibilidadId}/validar-presencia` — P0/AC.
- `CU-EVE-04`: `POST /eventuales/disponibilidades/{disponibilidadId}/finalizar` — P0/AC.
- `CU-EVE-05`: `GET /eventuales/reserva` — P0/PROP.
- `CU-EVE-06`: `GET /eventuales/calendario` — P0/PROP.
- `CU-EVE-07`: `POST /eventuales/preasignaciones` — P0/PROP.
- `CU-EVE-08`: `POST /eventuales/preasignaciones/{preasignacionId}/aceptar` — P1/PROP.
- `CU-EVE-09`: `POST /eventuales/preasignaciones/{preasignacionId}/liberar` — P0/PROP.
- `CU-EVE-10`: `POST /eventuales/evaluar-disponibilidad` — P0/PROP.
- `CU-EVE-11`: `POST /eventuales/preasignaciones/{preasignacionId}/no-presentado` — P0/PROP.
- `CU-EVE-12`: `GET /eventuales/metricas-espera` — P1/PROP.
- `CU-COB-01`: `POST /necesidades/evaluar` — P0/PROP.
- `CU-COB-02`: `POST /necesidades-cobertura` — P0/AC.
- `CU-COB-03`: `GET /necesidades-cobertura` — P0/AC.
- `CU-COB-04`: `GET /necesidades-cobertura/{necesidadId}` — P0/AC.
- `CU-COB-05`: `POST /necesidades-cobertura/{necesidadId}/validar` — P0/PROP.
- `CU-COB-06`: `PUT /necesidades-cobertura/{necesidadId}/competencias` — P0/AC.
- `CU-COB-07`: `GET /necesidades-cobertura/{necesidadId}/candidatos` — P0/PROP.
- `CU-COB-08`: `POST /asignaciones/simular` — P0/PROP.
- `CU-COB-09`: `POST /asignaciones-operativas` — P0/AC.
- `CU-COB-10`: `GET /asignaciones-operativas` — P0/AC.
- `CU-COB-11`: `POST /asignaciones-operativas/{asignacionId}/confirmar` — P0/PROP.
- `CU-COB-12`: `POST /asignaciones-operativas/{asignacionId}/cancelar` — P0/PROP.
- `CU-COB-13`: `POST /asignaciones-operativas/{asignacionId}/incorporaciones` — P0/AC.
- `CU-COB-14`: `POST /incorporaciones/{incorporacionId}/finalizar` — P0/PROP.
- `CU-COB-15`: `POST /necesidades-cobertura/{necesidadId}/aplicaciones` — P0/AC.
- `CU-COB-16`: `POST /aplicaciones-cobertura/{aplicacionId}/anular` — P0/PROP.
- `CU-COB-17`: `GET /necesidades-cobertura/{necesidadId}/remanente` — P0/PROP.
- `CU-COB-18`: `POST /movimientos-operativos` — P0/AC.
- `CU-COB-19`: `POST /movimientos-operativos/{movimientoOperativoId}/recepcion` — P0/PROP.
- `CU-COB-20`: `GET /cobertura/mapa` — P0/PROP.
- `CU-COB-21`: `GET /cobertura/alertas` — P0/PROP.
- `CU-COB-22`: `POST /necesidades-cobertura/{necesidadId}/cerrar` — P0/PROP.
- `CU-COB-23`: `POST /cobertura/recalcular` — P1/PROP.
- `CU-COB-24`: `GET /movimientos-operativos` — P0/AC.
- `CU-BAL-01`: `GET /balances/diarios` — P0/PROP.
- `CU-BAL-02`: `GET /balances/diarios/{servicioId}/detalle` — P0/PROP.
- `CU-BAL-03`: `POST /balances/simular-cierre` — P0/PROP.
- `CU-BAL-04`: `POST /balances/cierres` — P0/AC.
- `CU-BAL-05`: `GET /balances/cierres` — P0/AC.
- `CU-BAL-06`: `GET /balances/cierres/{cierreId}` — P0/AC.
- `CU-BAL-07`: `POST /balances/cierres/{cierreId}/rectificaciones` — P0/PROP.
- `CU-BAL-08`: `GET /balances/cierres/{cierreId}/conciliacion` — P0/PROP.
- `CU-BAL-09`: `GET /balances/indicadores` — P0/PROP.
- `CU-BAL-10`: `GET /balances/matriz-mensual` — P0/PROP.
- `CU-BAL-11`: `GET /balances/movimientos-resumen` — P0/PROP.
- `CU-BAL-12`: `GET /balances/pendientes` — P0/PROP.
- `CU-BAL-13`: `GET /balances/cierres/{cierreId}/pdf` — P0/PROP.
- `CU-BAL-14`: `GET /balances/cierres/{cierreId}/exportacion` — P1/PROP.
- `CU-BAL-15`: `GET /balances/cierres/{cierreId}/correcciones-posteriores` — P0/PROP.
- `CU-BAL-16`: `GET /balances/conciliacion-rh` — P1/PROP.
- `CU-BAL-17`: `GET /balances/tasas-ausentismo` — P0/PROP.
- `CU-BAL-18`: `GET /balances/fuentes-cobertura` — P0/PROP.

## B6 — Auditoría, reportes y notificaciones

CU oficiales (42): CU-ASI_CLIN-01, CU-ASI_CLIN-02, CU-ASI_CLIN-03, CU-ASI_CLIN-04, CU-ASI_CLIN-05, CU-ASI_CLIN-06, CU-ASI_CLIN-07, CU-ASI_CLIN-08, CU-ASI_CLIN-09, CU-ASI_CLIN-10, CU-ASI_CLIN-11, CU-ASI_CLIN-12, CU-ASI_CLIN-13, CU-ASI_CLIN-14, CU-ASI_CLIN-15, CU-REP-01, CU-REP-02, CU-REP-03, CU-REP-04, CU-REP-05, CU-REP-06, CU-REP-07, CU-REP-08, CU-REP-09, CU-REP-10, CU-REP-11, CU-REP-12, CU-REP-13, CU-NOT-01, CU-NOT-02, CU-NOT-03, CU-NOT-04, CU-NOT-05, CU-NOT-06, CU-AUD-01, CU-AUD-02, CU-AUD-03, CU-AUD-04, CU-AUD-05, CU-AUD-06, CU-AUD-07, CU-AUD-08.

Dependencias/decisiones: Auditoría mínima se integra desde B1, no se pospone. Reportes B5; NOT persistente y ASI_CLIN FUT necesitan V2/aprobación.

Criterio de aceptación: Reporte/PDF reproducible por cierre/ámbito; visor auditado; eventos solo tras commit, reconexión REST; métricas agregadas con definiciones validadas.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| ASI_CLIN | `indicadores_complejidad, mediciones_complejidad`. | Hoja de enlace estructurada por división/servicio/turno con camas autorizadas, reales, ocupación, graves, RCP, ventilación, alto flujo, CPAP/BiPAP y hemocomponentes; dashboard solo lectura de agregados autorizados. | Formulario de captura rápida agregada por turno con campos numéricos y notas; requiere aprobación de alcance para datos específicos. | Ocupación no negativa, camas reales vs autorizadas se reportan ambas, prohibir datos identificatorios de pacientes en JSON libre, respaldo de medición fuente. `mediciones_complejidad` no modela aún todo censo/productividad; módulo de enlace completo es FUT y necesita V2/aprobación. |
| REP | `cierres_balance, auditoria_general y read models derivados`. | Dashboard directivo con filtros de hospital, división, servicio, turno y fecha; KPIs tarjeta con definición, tendencias y drill-down con autorización. | Vistas de estado de cobertura de su ámbito si procede; no descargas masivas de personal por defecto. | Resultados reproducibles, export scoped, KPI que no confunde tasa de falta con dotación nominal, reporte con datos sin cambios si cierre es histórico. Indicadores de productividad por especialidad requieren fuentes/migraciones validadas; no copiar fórmulas de hoja sin homologar. |
| NOT | `movimiento_eventos, auditoria_general, tabla outbox V2`. | Servicio Socket.IO con reconexión que invalida queries REST/cache, mensajes de cambios de cobertura, incidental/conflicto y badge de conexión. | Solo eventos cuando app online; al recuperar red ejecutar sync/GET de snapshot en vez de confiar en mensajes perdidos. | No recibir eventos hospital ajeno, sin token no conecta, mensaje no se emite por rollback, reconexión reconstruye estado, event order y deduplicación. Outbox/notifications persistentes no existen en V1; requiere V2 para robustez. |
| AUD | `auditoria_general, movimiento_eventos, eventos_asistencia, incidencia_versiones, cierres_balance`. | Visor de auditoría por entidad, fecha, usuario/acción y diff filtrado; solo auditor autorizado; enlaces a versiones y cierres. | Indicadores de estado de sincronización y historial propio; sin acceso completo a auditoría. | Intento DELETE eventos asistencia rechazado, no UPDATE cierres, auditor ajeno no lee, no contraseñas ni JWT en logs. Auditoría V1 necesita política de retención, acceso y generación consistente desde cada use case; logs de denegados pueden requerir canal separado. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-ASI_CLIN-01`: `GET /indicadores-complejidad` — P0/AC.
- `CU-ASI_CLIN-02`: `POST /indicadores-complejidad` — P1/AC.
- `CU-ASI_CLIN-03`: `POST /mediciones-complejidad` — P0/AC.
- `CU-ASI_CLIN-04`: `GET /mediciones-complejidad` — P0/AC.
- `CU-ASI_CLIN-05`: `POST /censos-camas` — P1/FUT.
- `CU-ASI_CLIN-06`: `GET /censos-camas` — P1/FUT.
- `CU-ASI_CLIN-07`: `POST /productividad/hemocomponentes` — P2/FUT.
- `CU-ASI_CLIN-08`: `POST /productividad/quirofanos` — P2/FUT.
- `CU-ASI_CLIN-09`: `POST /productividad/tocoquirurgica` — P2/FUT.
- `CU-ASI_CLIN-10`: `POST /productividad/esterilizacion` — P2/FUT.
- `CU-ASI_CLIN-11`: `POST /complejidad/eventos` — P1/FUT.
- `CU-ASI_CLIN-12`: `GET /enlaces-turno` — P1/FUT.
- `CU-ASI_CLIN-13`: `POST /enlaces-turno` — P1/FUT.
- `CU-ASI_CLIN-14`: `POST /enlaces-turno/{enlaceId}/validar` — P1/FUT.
- `CU-ASI_CLIN-15`: `GET /cobertura/justificacion-complejidad` — P1/PROP.
- `CU-REP-01`: `GET /tableros/coordinacion` — P0/PROP.
- `CU-REP-02`: `GET /tableros/jefatura` — P1/PROP.
- `CU-REP-03`: `GET /tableros/supervision` — P0/PROP.
- `CU-REP-04`: `GET /reportes/deficits` — P0/PROP.
- `CU-REP-05`: `GET /reportes/tiempos-cobertura` — P1/PROP.
- `CU-REP-06`: `GET /reportes/cobertura-efectiva` — P0/PROP.
- `CU-REP-07`: `GET /reportes/movimientos` — P1/PROP.
- `CU-REP-08`: `GET /reportes/incidencias` — P0/PROP.
- `CU-REP-09`: `GET /reportes/vencimientos` — P1/PROP.
- `CU-REP-10`: `GET /reportes/carga-asistencial` — P1/PROP.
- `CU-REP-11`: `POST /reportes/exportaciones` — P1/PROP.
- `CU-REP-12`: `GET /reportes/exportaciones/{exportacionId}` — P1/PROP.
- `CU-REP-13`: `GET /indicadores/definiciones` — P0/PROP.
- `CU-NOT-01`: `GET /notificaciones` — P1/FUT.
- `CU-NOT-02`: `POST /notificaciones/{notificacionId}/leer` — P1/FUT.
- `CU-NOT-03`: `PUT /notificaciones/preferencias` — P2/FUT.
- `CU-NOT-04`: `POST /notificaciones/dispositivos` — P1/FUT.
- `CU-NOT-05`: `POST /notificaciones/entregas` — P2/FUT.
- `CU-NOT-06`: `GET /eventos/snapshot` — P0/PROP.
- `CU-AUD-01`: `GET /auditorias` — P0/AC.
- `CU-AUD-02`: `GET /auditorias/entidades/{tipo}/{id}` — P0/PROP.
- `CU-AUD-03`: `GET /auditorias/decisiones` — P0/PROP.
- `CU-AUD-04`: `POST /auditorias/exportaciones` — P1/PROP.
- `CU-AUD-05`: `POST /seguridad/incidentes` — P1/PROP.
- `CU-AUD-06`: `GET /seguridad/politicas` — P0/PROP.
- `CU-AUD-07`: `GET /seguridad/retencion` — P2/FUT.
- `CU-AUD-08`: `POST /privacidad/solicitudes` — P2/FUT.

## B7 — Android y sincronización persistente

CU oficiales (5): CU-OPS-04, CU-OPS-05, CU-OPS-06, CU-OPS-07, CU-OPS-08.

Dependencias/decisiones: B1/B3/B4; aprobación V2 inbox/idempotencia y protocolo versiones/retención.

Criterio de aceptación: Room/WorkManager conserva clientEventId; reenvíos no duplican en servidor; revocación deniega; conflicto entre dispositivos visible; sin autorización definitiva offline.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| OPS | `sin tabla propia obligatoria; inbox/idempotencia/sync V2`. | Página de estado/errores de sincronización solo para soporte, dashboard de tareas fallidas, historial de deploy sin datos personales. | Room + WorkManager; cola de cambios con clientEventId y versión, barra sincronización y resolución de conflictos por elemento; token vencido detiene sincronización y pide re-login. | Pérdida red, 30 eventos reintentados sin duplicación, DB caída -> 503, reinicio y replay, límite tamaños de lote y acceso a docs. Falta modelo SQL de inbox/idempotencia, jobs y outbox. Despliegue TI intranet debe validarse. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-OPS-04`: `POST /sync/lotes` — P0/PROP.
- `CU-OPS-05`: `GET /sync/cambios` — P0/PROP.
- `CU-OPS-06`: `GET /operaciones/{operacionId}` — P0/PROP.
- `CU-OPS-07`: `GET /sync/catalogos` — P0/PROP.
- `CU-OPS-08`: `GET /ops/sync-metricas` — P1/PROP.

## B8 — Importación y conciliación

CU oficiales (13): CU-MIG-01, CU-MIG-02, CU-MIG-03, CU-MIG-04, CU-MIG-05, CU-MIG-06, CU-MIG-07, CU-MIG-08, CU-MIG-09, CU-MIG-10, CU-MIG-11, CU-MIG-12, CU-MIG-13.

Dependencias/decisiones: Origen/hospital verificado; acceso sensible aprobado; V2 staging aprobado; B1/B2/B3.

Criterio de aceptación: Preview→decisión→lote trazable; reimportación no duplica; hospital equivocado rechazado; no leer fuentes PII desde pruebas.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| MIG | `empleados, contratos, adscripciones, plantilla_servicio, programacion_laboral más staging V2`. | Wizard de importación: fuente/ámbito, columnas y mapa, previsualización de conflictos, aprobación y reporte final con filas válidas/rechazadas. | No desarrollar importación móvil. | Reimportar lote idéntico, RUD duplicado entre archivos, horario particular, código de subárea ambiguo, hospital incorrecto, ninguna fila aplicada sin aprobación. Faltan tablas `importacion_lotes`, `importacion_filas`/mapeos/errores V2; el sistema no debe leer hojas de Drive desde producción sin permisos explícitos. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-MIG-01`: `POST /migraciones/fuentes` — P1/FUT.
- `CU-MIG-02`: `POST /migraciones/lotes` — P0/FUT.
- `CU-MIG-03`: `GET /migraciones/lotes/{loteId}/mapeo` — P0/FUT.
- `CU-MIG-04`: `PUT /migraciones/lotes/{loteId}/mapeo` — P0/FUT.
- `CU-MIG-05`: `POST /migraciones/lotes/{loteId}/prevalidar` — P0/FUT.
- `CU-MIG-06`: `GET /migraciones/lotes/{loteId}/errores` — P0/FUT.
- `CU-MIG-07`: `POST /migraciones/lotes/{loteId}/simular` — P0/FUT.
- `CU-MIG-08`: `POST /migraciones/lotes/{loteId}/aplicar` — P0/FUT.
- `CU-MIG-09`: `GET /migraciones/lotes/{loteId}` — P0/FUT.
- `CU-MIG-10`: `POST /migraciones/lotes/{loteId}/revertir` — P1/FUT.
- `CU-MIG-11`: `GET /migraciones/lotes/{loteId}/discrepancias` — P1/FUT.
- `CU-MIG-12`: `POST /migraciones/balances-historicos` — P1/FUT.
- `CU-MIG-13`: `POST /migraciones/catalogos-incidencia` — P0/FUT.

## B9 — Documental condicionado

CU oficiales (17): CU-DOC-01, CU-DOC-02, CU-DOC-03, CU-DOC-04, CU-DOC-05, CU-DOC-06, CU-DOC-07, CU-DOC-08, CU-DOC-09, CU-DOC-10, CU-DOC-11, CU-DOC-12, CU-DOC-13, CU-DOC-14, CU-DOC-15, CU-DOC-16, CU-DOC-17.

Dependencias/decisiones: Autorización Jurídico/Jefatura, privacidad/retención/firma y esquema V2 aprobado.

Criterio de aceptación: Criterios institucionales por definir; no sanción automática, folios/versiones inmutables y acceso por facultad.

| Módulo | Tablas V1 / brecha | Pantalla Angular | Android | Pruebas y riesgos específicos |
|---|---|---|---|---|
| DOC | `NINGUNA tabla especializada en SQL V1`. | Plantilla de documento con campos guiados, adjuntos protegidos, validación jurídica, seguimiento de folio, acuses y acceso restringido por rol. | Acuse y lectura restringida solo si se aprueba; no firma legal simulada ni foto de evidencia sin procedimiento. | Folio no reutilizable, rectificación versionada, acceso restringido, retención y cadena de custodia, ausencia de sanción automática. FUTURO y bloqueado: falta aprobación institucional y modelo físico. |

Contratos oficiales del bloque (no publicados por este plan):

- `CU-DOC-01`: `GET /documentos/tipos` — P2/FUT.
- `CU-DOC-02`: `POST /documentos/actas` — P2/FUT.
- `CU-DOC-03`: `GET /documentos/actas` — P2/FUT.
- `CU-DOC-04`: `GET /documentos/actas/{actaId}` — P2/FUT.
- `CU-DOC-05`: `PATCH /documentos/actas/{actaId}` — P2/FUT.
- `CU-DOC-06`: `POST /documentos/actas/{actaId}/evidencias` — P2/FUT.
- `CU-DOC-07`: `POST /documentos/actas/{actaId}/enviar-revision` — P2/FUT.
- `CU-DOC-08`: `POST /documentos/actas/{actaId}/revisiones` — P2/FUT.
- `CU-DOC-09`: `POST /documentos/actas/{actaId}/emitir` — P2/FUT.
- `CU-DOC-10`: `GET /documentos/actas/{actaId}/pdf` — P2/FUT.
- `CU-DOC-11`: `POST /documentos/actas/{actaId}/acuses` — P2/FUT.
- `CU-DOC-12`: `POST /documentos/actas/{actaId}/firmas` — P2/FUT.
- `CU-DOC-13`: `POST /documentos/actas/{actaId}/correcciones` — P2/FUT.
- `CU-DOC-14`: `POST /documentos/actas/{actaId}/escalamientos` — P2/FUT.
- `CU-DOC-15`: `POST /supervision-calidad/hallazgos` — P2/FUT.
- `CU-DOC-16`: `POST /supervision-calidad/hallazgos/{hallazgoId}/seguimientos` — P2/FUT.
- `CU-DOC-17`: `GET /supervision-calidad/indicadores` — P2/FUT.
