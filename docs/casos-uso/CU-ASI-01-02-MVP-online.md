# CU-ASI-01/02 — especificación mínima de pase de lista online

Estado: **especificación para implementar; no implementada ni autorizada su ejecución**. Objetivo: demostración del 22-11-2026. Sustituye únicamente la identificación provisional CU-MOV-01 del encargo, sin modificar el catálogo de movimientos. Fuente de diagnóstico: `docs/sprint/CU-MOV-01-inspeccion-pase-lista-movil.md`; autoridad estructural: maestro V1 y catálogo ASI de la especificación de casos de uso.

## A. Alcance y estados

Una jornada programada → primera captura operativa → evento inmutable y auditoría → consulta desde Coordinación. Sin lotes, offline, corrección, validación administrativa, incidencias formales, asignaciones, incorporaciones o cobertura. No existe entidad de pase completo: la unidad persistida es `programacion_id`.

| Catálogo V1 | Valores reales | Regla MVP |
|---|---|---|
| Programación | PROGRAMADA, CANCELADA, SUSTITUIDA, CERRADA | Solo PROGRAMADA admite primera captura. Los otros estados son visibles, no capturables. |
| Asistencia operativa | PENDIENTE, PRESENTE, AUSENTE, PARCIAL, NO_EXIGIBLE | PUT admite PRESENTE/AUSENTE/PARCIAL. Sin fila se proyecta PENDIENTE con `capturada=false`; no se inserta por consultar. NO_EXIGIBLE queda fuera de captura. |
| Validación | PENDIENTE, VALIDADA, OBSERVADA | Nueva fila siempre PENDIENTE, validado_por/en nulos. Ningún cambio de validación por estas rutas. |
| Incidencia administrativa | CAPTURADA, EN_REVISION, AUTORIZADA, RECHAZADA, CANCELADA | No se crea/modifica por marcar asistencia. AUSENTE es observación operativa pendiente de justificar, no falta administrativa autorizada. |

**Decisiones MVP:** solo primera captura, sin modificar filas de asistencia preexistentes, incluso si están PENDIENTE. En ese caso responder conflicto y remitir al futuro flujo de corrección. No se capturan llegada/salida: permanecen nulas; la hora del evento acredita cuándo se capturó, no cuándo llegó la persona. PARCIAL es observación operativa sin cálculo de horas efectivas.

**Ventana de captura:** exclusivamente durante `[inicio_programado, fin_programado)`, con reloj servidor. Sin tolerancias, retroactividad ni anticipación implícitas. Fin alcanzado → 409. Esta política acotada sirve al MVP, no sustituye la aprobación institucional de ventanas definitivas. Solo contratos ACTIVO vigentes en la fecha local de inicio, empleado/contexto activos y programación coherente. Jornada nocturna se identifica por su fecha de inicio local, aunque termine al día siguiente.

## B. Contrato HTTP propuesto

Prefijo `/api/v1`, JSON, Bearer IAM existente, sin cookies nuevas. Dos rutas nuevas detrás de una futura bandera específica `ASISTENCIA_ENABLED=false` por defecto y del control IAM existente. La bandera se propone, **no existe aún**. No activar L3A o IAM permanentemente. Todos los UUID se validan y documentan con `format: uuid`; tiempos RFC3339 con offset; BIGINT de evento como cadena decimal.

### GET /pases-lista — CU-ASI-01

DTO `PaseListaQueryDto` independiente: no heredar filtros que esta ruta no admita.

| Campo query | Regla |
|---|---|
| hospitalId, servicioId | UUID obligatorios. Hospital y servicio se contrastan con organización persistida y ámbito IAM. |
| fecha | Obligatoria YYYY-MM-DD, fecha de calendario real; zona de `hospitales.zona_horaria`. Selecciona jornadas cuyo inicio local pertenece a ese día. |
| horarioId | UUID opcional; filtra igualdad contra horario_id. Omitido incluye jornadas sin horario; no inventar turno_id. |
| cursor | UUID opcional del último programacion_id; comparación estricta `>` y orden ascendente. |
| limit | Entero decimal 1..100, defecto 50; consultar limit+1 para nextCursor. |

Rechazar null, arreglos/repeticiones de parámetros escalares, fechas imposibles y campos extra con 400. Un día local es el intervalo entre dos medianoches locales, no sumar siempre 24 h UTC. No admitir búsqueda libre, empleadoId, intervalos arbitrarios ni filtros administrativos en este MVP. Paginación sin garantía de snapshot entre peticiones: refrescar tras captura y no usar el listado paginado para certificar totales globales.

200: `{ hospitalId, servicioId, fecha, zonaHoraria, items, nextCursor, limit, order: "id:asc" }`.

Cada item:

- `programacionId`, `empleado: {empleadoId,nombres,primerApellido}`, `horarioId`/`turnoCodigo` anulables, inicioProgramado, finProgramado, estadoProgramacion.
- `capturada` boolean; `asistenciaId` UUID|null; `estadoOperativo` del catálogo; `validacionAdministrativa` del catálogo|null, nula sin fila.
- `revision` cadena decimal: "0" sin eventos; último evento_id de esa asistencia cuando exista. No es una columna de tabla. `ultimaCaptura: {eventoId,actorId,registradoEn}|null`, solo para eventos de captura reconocidos; no atribuir autor a validado_por.
- `capturable` boolean y `motivoNoCapturable` enum|null: FUERA_VENTANA, PROGRAMACION_NO_CAPTURABLE, CONTRATO_NO_VIGENTE, YA_REGISTRADA, CIERRE_EXISTENTE, SIN_FACULTAD_CAPTURA. Si concurren, prioridad en ese orden salvo YA_REGISTRADA primero. La comprobación de PUT siempre es autoritativa.

Sin resultados → 200 con items=[] y nextCursor=null. No incluir observaciones libres ni motivo/diagnóstico de incidencias, RUD, validado_por como capturador ni datos de contrato completos. Si hay asistencia histórica sin eventos, proyectar su estado sin inventar autor/revisión histórica; no permitir escribirla.

### PUT /programaciones/{programacionId}/asistencia — CU-ASI-02

Parámetro programacionId UUID. Header obligatorio `Idempotency-Key`: UUID v4 generado una sola vez por comando. Se conserva tras timeout, refresh de sesión o reintento del mismo usuario. No es un token secreto; tampoco se registra junto a datos personales en logs.

DTO estricto `CapturarAsistenciaDto`:

```json
{"estado":"PRESENTE","expectedRevision":"0"}
```

`estado`: PRESENTE/AUSENTE/PARCIAL, mayúsculas exactas. `expectedRevision`: cadena literal "0" requerida, porque solo se permite primera captura. Rechazar números, null, propiedades extra y valores distintos con 400. No se aceptan actorId, hospitalId, empleadoId, observaciones, llegada/salida, validación o incidencias; esa reducción evita texto sensible y nuevas reglas de corrección. No sustituir campos omitidos con datos inventados.

200, tanto primera captura como reintento confirmado: `{programacionId,asistenciaId,eventoId,estadoOperativo,validacionAdministrativa:"PENDIENTE",actorId,registradoEn,revision}`. revision=eventoId, ambos cadena. Se devuelve el mismo acuse inmutable para la misma operación; no agregar un campo variable replayed. No enviar 200 antes de COMMIT.

### Errores y precedencia

Reutilizar el cuerpo estándar de excepciones Nest documentado por `ReadHttpErrorDto`: `{statusCode:number,message:string|string[],error:string}`; sin cambiar globalmente errores existentes. Mensajes estables, sin SQL, nombres internos, payload o existencia de recursos ajenos.

| HTTP | Aplicación |
|---|---|
| 400 | Ambas: validaciones anteriores; PUT también header ausente/inválido. |
| 401 | Sesión/access token inválido, expirado, revocado o usuario inactivo. |
| 403 | Principal autenticado sin facultad aplicable, o ámbito solicitado por GET no autorizado. |
| 404 | GET: contexto inexistente tras autorizar su ámbito. PUT: programación inexistente o fuera del ámbito del actor; misma respuesta para evitar enumeración. |
| 409 | Solo PUT: YA_REGISTRADA, FUERA_VENTANA, PROGRAMACION_NO_CAPTURABLE, CONTRATO_NO_VIGENTE, CIERRE_EXISTENTE o IDEMPOTENCY_CONFLICT, expresados como message estable. |
| 503 | Función deshabilitada, recurso DB no disponible, espera acotada agotada, error transaccional no recuperable o COMMIT incierto. PUT indica mensaje genérico para reintentar con la misma clave, sin afirmar rollback si es desconocido. |

Orden contractual: guard de disponibilidad; autenticación; validación; comprobación de facultad; ámbito/recurso; idempotencia; elegibilidad/estado; escritura. Un replay también exige sesión y autorización **vigentes**: no entrega acuse tras revocación aunque existiera una captura anterior. No introducir 422 o 201 sin cambiar esta especificación y sus pruebas. Errores 500 inesperados siguen siendo posibles; se manejan sanitizados y no se anuncian como flujo de negocio.

## C. Facultades y ámbitos

Captura exige **ASISTENCIA_CAPTURAR**, código existente en semillas V1, y asignación vigente para el hospital/división/servicio real de la jornada. No se infiere autoridad de una cadena de rol, cargo de jefe, CATALOGOS_ADMINISTRAR o acceso previo a programación.

GET exige ASISTENCIA_CAPTURAR **o** ASISTENCIA_VALIDAR dentro del ámbito, evaluadas por separado con las reglas IAM actuales. Así el capturador consulta su pase y un supervisor/Coordinación que ya tenga validación autorizada puede consultar. **No asignar ASISTENCIA_VALIDAR solo para habilitar lectura**; si Coordinación no debe tener esa facultad, se bloquea su acceso hasta aprobar un permiso específico de consulta en otro encargo. El MVP no crea esa facultad ni permite validar desde estas rutas.

TITULAR: mandato iniciado, asignación y usuario/contextos activos, permisos del rol explícitos y vigencia no expirada. ENCARGADO: lo anterior más mandato con fin y la facultad solicitada explícita en `encargo_permisos`. Sin herencia automática de todas las facultades del titular. La jerarquía real de servicio/división/hospital se valida en la consulta final; nunca basta con el parámetro del cliente.

Para datos sintéticos del entorno efímero, proponer dos hospitales, un capturador A, un capturador B, un lector de Coordinación con VALIDAR expresamente autorizado, otro usuario sin permiso y encargados con/sin permiso. Todas las asignaciones requieren aprobación explícita de preparación; no se hacen aquí. La autorización reside en NestJS/SQL de consulta; **no hay RLS**.

## D. Transacción, duplicados y trazabilidad

Implementación prevista mediante `PostgresService.withTransaction(...,{readOnly:false})`, un PoolClient, READ COMMITTED y consultas parametrizadas `sigeh.*`. Cada sentencia limitada a 5 s, lock a 2 s; petición total objetivo máximo 10 s, sin repetir automáticamente escrituras o COMMIT. Valores propuestos para esta operación, no cambios de configuración actuales.

1. Autenticar; en transacción comprobar recurso autorizado. Tomar advisory lock de transacción por clave determinista de programacionId (hash estable de 64 bits documentado y común a todos los escritores). Una colisión serializa recursos adicionales, nunca autoriza acceso.
2. Tras esperar el lock, reconsultar recurso, sesión, facultad y ámbito en snapshot nuevo. Evaluar vigencias con tiempo servidor actual tras espera, no solo con CURRENT_TIMESTAMP de inicio de transacción. Mantener los mismos predicados jerárquicos de IAM. Punto de autorización: sentencia final de captura; una revocación posterior a ese punto no convierte retroactivamente el COMMIT en inválido.
3. Buscar en eventos de esa jornada una captura con `(actor_id, datos.clientEventId)` igual a la clave. Hash SHA-256 canónico del comando normalizado: versión de contrato, actor, programacionId, estado y expectedRevision; no incluir JWT/sessionId. Misma clave/contenido devuelve acuse original; contenido distinto → 409. Buscar antes de comprobar ventana/registro existente para recuperar una captura cuyo COMMIT ocurrió antes del timeout.
4. Sin replay: rechazar cualquier fila de registros_asistencia existente. UNIQUE(programacion_id) protege también de un escritor que eluda el lock; su 23505 se revierte y se traduce a 409, no se silencia en la transacción.
5. Comprobar ventana, programación/contrato y ausencia de cierre de balance solapado para hospital/servicio. Con cierre EMITIDO o RECTIFICADO, denegar captura; no reescribirlo. Para este MVP no habrá otros escritores de programación/cierres durante la prueba. Antes de uso compartido, todos sus escritores deben adoptar un protocolo de bloqueo común: advisory lock de asistencia por sí solo no resuelve esa carrera.
6. INSERT registros_asistencia: programacion_id/estado; validación PENDIENTE y resto de campos opcionales nulos. INSERT eventos_asistencia con clase `CAPTURA_INICIAL`, actor de sesión, hora del servidor y datos JSON de versión 1: clientEventId, commandHash, estado anterior null/nuevo, revisión esperada y asistenciaId conocido. Reconstruir el acuse con esas propiedades y las columnas evento_id/actor_id/ocurrido_en devueltas por INSERT RETURNING; no actualizar el evento para completar datos después. La clase cabe en varchar(35), pero es convención del módulo, no un enum V1.
7. INSERT auditoria_general: hospital, tabla registros_asistencia, registro_id, accion INSERT, actor, anterior nulo y nuevo mínimo (IDs/estado/evento), sin nombre del empleado o tokens. Confirmar las tres inserciones en una transacción. Fallo en cualquiera → rollback; secuencias pueden dejar huecos y no son contadores de capturas.

`eventos_asistencia` conserva su trigger inmutable; no se concede UPDATE/DELETE. `auditoria_general` no tiene ese trigger: la protección del rol app será INSERT/SELECT mínimo, sin UPDATE/DELETE; no presentarla como inmutable por esquema. No usar auditoria_seguridad IAM como sustituto de un evento de negocio. Eventos/grants no se generan por consultar.

**Límite explícito de idempotencia sin migración:** la clave se limita a actor+jornada; JSONB no tiene UNIQUE de clave cliente. La garantía del módulo depende de bloqueo y protocolo de todos los escritores. Dos claves distintas sobre la misma jornada → una captura y un 409; misma clave concurrente → un evento y dos acuses iguales. No hay inbox global/dispositivo, lotes ni outbox. Si no puede demostrarse esa garantía en las pruebas, FAIL y bloqueo de activación; no conceder permisos ni agregar columnas para ocultarlo.

Permisos futuros a revisar por columnas: SELECT sobre programación/contrato/contextos/empleado mínimo, zona horaria y horario; SELECT/INSERT de registros y eventos; INSERT de auditoría y USAGE de sus dos secuencias exactas cuando sea necesario; SELECT mínimo de cierres para la comprobación. **No hace falta UPDATE de asistencia en primera captura ni UPDATE de programación para bloquearla.** Sin permisos sobre incidencias/asignaciones/cobertura, sin DELETE ni cambios de validación. ACL exacta y rollback serán otro paquete autorizado, no parte de este documento.

## E. Proyección para Coordinación

Base autoritativa: programacion_laboral con contrato consistente (contrato/empleado/hospital), servicio y jerarquía real; LEFT JOIN por registros_asistencia.programacion_id y evento de captura reconocido, filtrado por el ámbito. No construir el pase juntando páginas de padrón desde el cliente ni exigir adscripción nominal si la jornada válida pertenece al servicio real.

Mostrar por jornada: programado, sin capturar/capturado, estado operativo, validación administrativa pendiente/validada/observada cuando exista y autor/hora de captura. Contadores sobre la página se rotulan «en esta página»; no sumarlos como totales del hospital. No deducir clasificación administrativa de AUSENTE ni disponibilidad/cobertura a partir de PRESENTE. Las cinco lecturas y el tablero existentes no cambian de semántica.

La consulta respeta el permiso actual del lector, aunque el autor tuviera acceso al capturar. Nunca devuelve historia/observaciones libres ajenas o todos los hospitales mediante SQL directo. Actualización de pantalla por reconsulta REST tras confirmación; sin WebSocket en el MVP.

## F. Prueba efímera reproducible — plan pendiente de autorización

No utilizar QA habitual ni clones de datos institucionales. **No ejecutar los runners actuales contra otro destino:** `qa-demo-core.mjs` fija contenedor/base/clúster habituales; `assertQaTarget` fija 127.0.0.1:55432. L3A grants fija además el clúster 7707094012630982690. Un simple cambio de variables no permite un destino efímero seguro.

Preparación futura, en este orden y con detención por discrepancia:

1. Revisar/aprobar paquete efímero separado y su hash: inicialización de V1 intacta + migración canónica V2, permisos explícitos revisados y fixtures sintéticos. No ejecutar propuestas V2 duplicadas. Creación de contenedor/red/volumen y aplicación del esquema **solo en ese recurso nuevo**, con autorización adicional concreta.
2. Manifiesto externo protegido (directorio 0700, archivo 0600) con runId UUID, proyecto/nombres exactos `sigeh-asi-<runId>`, containerId, image digest PG17.11, volumeId/nombre propio, networkId, bind `127.0.0.1:55433`, base `sigeh_qa`, roles `sigeh_qa_bootstrap`/`sigeh_qa_app` del clúster nuevo y systemIdentifier propio. Esos nombres de base/roles permiten reutilizar las comprobaciones V2; **no reutilizar sus credenciales**. El nuevo systemIdentifier debe diferir de 7707094012630982690. Rechazar puerto 5432/55432, volumen/red/container habituales y cualquier montaje de sus datos.
3. Crear recursos nuevos con etiquetas de propiedad/runId y sin unión a las redes institucional/QA habitual. SCRAM desde la inicialización, ningún trust; comprobar permisos efectivos y autenticación positiva/negativa. No montar Docker socket en servidor/app. Secretos aleatorios externos, no args/env persistentes/logs ni archivos Git.
4. Inicializar base vacía exclusivamente con scripts revisados. V1 desde archivo de hash conocido; V2 una vez; privilegios adaptados y auditados al **nuevo** manifiesto, no editar/quitar guardas de los scripts históricos. Comparar baseline 58/100/303, ocho triggers, restricciones/índices válidos. Las futuras ACL de asistencia serán delta explícito del paquete efímero, no se esperan las 100 ACL históricas sin ese delta.
5. Adaptador solo de pruebas en `apps/api/test`: crear Pool tras validar identidad Docker+SQL contra manifiesto; en TestingModule sustituir `PG_POOL` antes de compilar para no ejecutar la fábrica de QA habitual. Mantener intactos `assertQaTarget`, launcher normal y defaults. Importar módulos reales, misma validación/prefijo/guards del bootstrap y escuchar únicamente 127.0.0.1:3001. Probar que el adaptador rechaza destino habitual/institucional antes de usar secretos. Si la composición Nest ejecuta la fábrica habitual o abre otro Pool, FAIL; no sustituirla por una API simulada.
6. Preparar fixtures de dos hospitales/servicios, contratos vigentes, jornadas actuales y nocturnas, usuarios/mandatos y facultades aprobadas. Registrar IDs exactos y baseline; usar horas relativas al servidor para casos de ventana, sin cambiar reloj. No copiar datos reales. Credenciales solo en custodia privada y tokens en memoria.
7. Ejecutar pruebas de G desde API con rol app, incluyendo COMMIT y lectura desde segundo cliente, integridad y efectos de eventos. Conservar auditoría inmutable durante todo el ciclo; no intentar borrarla por DML. Capturar evidencia sanitizada fuera de secretos.
8. Cerrar clientes/Pool/servidor. Verificar que todos los datos son sintéticos y que los recursos siguen siendo los IDs del manifiesto. Eliminar **solo el contenedor y almacenamiento efímeros aprobados**, identificados por ID/etiquetas y sin borrado amplio; nunca `down -v` sobre proyectos existentes. Esta destrucción de recursos de prueba requiere autorización explícita junto con creación. Si no está autorizada, detener/retener bajo custodia e informar; no borrar eventos individualmente. Verificar ausencia de listeners y recursos propios, preservando evidencia sin credenciales.

Este es el procedimiento a implementar, **no comandos disponibles ni ejecutados**. Faltan el adaptador, manifiesto ejecutable y runner efímero; no reutilizar nombres de comandos inexistentes como si ya funcionaran. La ejecución solo será reproducible cuando ese paquete pase sus pruebas estáticas y se apruebe la creación/retirada exacta de recursos. Dispositivo Android físico: transporte USB/emulador local aprobado, sin cambiar bind a 0.0.0.0; Angular usa proxy/origen local aprobado, sin CORS abierto.

## G. Secuencia y aceptación

| Orden / responsable | Entrega | PASS obligatorio / FAIL que detiene |
|---|---|---|
| 1. Backend, ficha/contrato | DTOs, política ASI, bandera deshabilitada, dos rutas y OpenAPI reproducible | Solo parámetros especificados, errores reales, esquemas UUID/BIGINT correctos; 19 rutas actuales preservadas y dos nuevas al implementarlas. |
| 2. Backend, persistencia | Repositorio transaccional, captura/evento/auditoría, idempotencia y límites | Primera captura, retry, colisión de payload, dos capturas simultáneas, bloqueo agotado y rollback; ningún efecto parcial o ampliación de permisos. |
| 3. QA, entorno autorizado | Manifiesto, Pool/adaptador y recursos aislados, permisos/facultades aprobados | Destino exacto y negativas ante destino equivocado; 58/100/303 sin deriva; historia inmutable permanece protegida. Sin autorización → BLOCKED, no arrancar. |
| 4. QA, API real | Pruebas de escritura/lectura con dos clientes | Persistencia tras COMMIT y mismo autor; misma clave concurrente un evento; claves diferentes una captura; fuera de ventana, cancelada/cerrada/sustituida, contrato vencido y cierre rechazados. |
| 5. QA, autorización | Casos A→B/B→A, servicio cruzado, sin permiso, revocación/expiración, encargados | 401/403/404 según contrato, sin fuga de nombres/estados; SQL directo no recibe promesa de RLS. Replay tras revocación denegado. |
| 6. Android online | Login/contexto, pase paginado y captura con acuse | No confirma antes de COMMIT; timeout conserva clave; doble toque sin doble registro; sin cola offline ni datos persistidos sensibles innecesarios. |
| 7. Angular Coordinación | Lectura del mismo registro y actualización REST | Estado, validación y autor coinciden con servidor; sin confundir programado/presente/incorporado/cubierto ni otorgar permisos desde UI. |
| 8. Cierre QA | Evidencia sanitizada y eliminación del recurso efímero autorizado | Integridad y ACL con delta previsto, sin secretos ni cambios de QA habitual/institucional; recursos temporales retirados por IDs. |

En cada implementación: build, lint, TypeScript, unitarias y HTTP locales; después integración real autorizada. Pruebas adicionales: campos extra/null/UUID/fecha/limit inválidos, paginación estable, no marcado por omisión, medianoche nocturna, zona horaria, actor manipulado y lectura de columnas fuera de ACL. Debe probarse que un fallo de evento/auditoría revierte asistencia; huecos de secuencia no son FAIL.

Plan orientativo: backend/contrato y paquete efímero primero; Android y Angular pueden preparar clientes con el contrato, pero no declarar operatividad hasta QA real. Mantener alcance de dos rutas/primera captura para el plazo; estimación heredada 5–7,5 jornadas-persona en paralelo, a reestimar incluyendo adaptador efímero. La fecha no justifica desactivar controles.

## Verificación documental y pendientes de autorización

Se inspeccionaron el informe anterior, DTO/SQL de lecturas, políticas/CTE IAM, Pool/guardas de destino, scripts V2/grants y esquema maestro. Se creó únicamente esta ficha, sin alterar evidencias históricas. No hubo build ni pruebas de aplicación: no cambió código. Validación local: hash maestro, número de rutas OpenAPI y `git diff --check`; resultados registrados en la entrega.

Listo para iniciar implementación **cuando se solicite**. Pendientes antes de ejecución: aprobación de recursos efímeros y su retirada, paquete mínimo SQL para ese clúster, asignaciones sintéticas explícitas, lector de Coordinación legitimado y transporte local. Sin cambios de código, esquema, roles, permisos, datos, contenedores o frontend; sin commits, despliegues ni conexión a QA/institucional.
