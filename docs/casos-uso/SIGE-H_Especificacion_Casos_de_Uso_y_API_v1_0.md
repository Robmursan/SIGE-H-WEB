# SIGE-H — Especificación integral de casos de uso, contratos API y arquitectura de módulos/gateways

> **Versión:** 1.0 de trabajo · **Fecha:** 7 de noviembre de 2026  
> **Proyecto:** SIGE-H — Sistema Integral de Gestión de Enfermería Hospitalaria  
> **Estado:** **PROPUESTA TÉCNICA / PENDIENTE DE VALIDACIÓN INSTITUCIONAL**. No se afirma que todos los flujos estén implementados ni aprobados.  
> **Eje:** Balance de personal, programación, asistencia/incidencias, eventuales, cobertura, trazabilidad y reportes.  
> **Plataformas documentadas:** Web Angular; aplicación Android (Jetpack Compose); backend NestJS; PostgreSQL 17 probado por el equipo; Docker/intranet hospitalaria como destino propuesto.  
> **Notación de estado:** `AC` = acordado en conversación / fuentes de proyecto (NO implica implementado); `PROP` = contrato o comportamiento propuesto para desarrollar; `FUT` = expansión que requiere aprobar alcance y/o modelado SQL. **P0/P1/P2** = propuesta de prioridad, no compromiso contractual.

## 0. Resumen ejecutivo

Este documento transforma el análisis de SIGE-H en un backlog trazable de **casos de uso → endpoints REST → módulos NestJS → tablas PostgreSQL → reglas de aceptación/pruebas**. La propuesta principal es un **monolito modular** con módulos por dominio, **API Gateway/BFF lógico** para web y móvil, **WebSocket Gateway** para señales de actualización en vivo, y **gateways de infraestructura (ports/adapters)** para persistencia, archivos y notificaciones. **No iniciar con microservicios** sin necesidad de escalabilidad organizacional/operativa demostrada.

**Línea base técnica comprobada por la persona usuaria:** `SIGE-H_BASE_DATOS_MAESTRA_V1.sql`, 51 tablas, 113 FK, 87 índices, 8 triggers, una vista; diagnóstico estructural sin hallazgos y pruebas transaccionales 8/8 exitosas con `ROLLBACK`. **NO constan aún resultados** de las baterías 03 (integración), 04 (permisos) y 05 (concurrencia), que fueron preparadas pero no reportadas. Las tablas y sus FK no proporcionan por sí solas autorizaciones jerárquicas, integridad de proceso completo ni cálculo de cobertura.

**Alcance exacto del artefacto:** catálogo exhaustivo de escenarios identificados o razonablemente derivados de las fuentes revisadas, sujeto a validación de casos límite. No es posible garantizar que contiene literalmente toda excepción institucional no documentada. Endpoint propuesto **no equivale** a endpoint ya publicado.

## 1. Fuentes y trazabilidad de origen

### 1.1 Conversaciones y artefactos SIGE-H (fuentes internas)

- Reglas acordadas sobre jerarquía, patrón de descansos, horarios, guardias nocturnas fijas, festivos, contratación base/eventual, plazas, rotación por subárea, incidencias, convenios no recíprocos, pases de salida sin regreso obligatorio, coberturas, retroactividad con historia inmutable y capacidades por categoría/competencia.
- SQL maestro V1: `/SIGE-H_BASE_DATOS_MAESTRA_V1.sql` (archivo entregado en conversación, instalado y probado estructuralmente por el equipo). El DDL real es la fuente de los nombres de tablas en este documento.
- Pruebas 01–02 ejecutadas y reportadas por el equipo; pruebas 03–05 aún no evidenciadas.

### 1.2 Google Drive: Administración de Proyectos de TI

- [Carpeta Administración de Proyectos de TI](https://drive.google.com/drive/folders/1F2I36vDJV_2epP0Inw8OkmsovN4onivI). Metodología de trazabilidad, entregables, alcance y pruebas.
- [Acta de constitución P2-F01](https://docs.google.com/document/d/1dNBVGRpNH7cD4LSTh8w6z8CwDYNMJjKrYfNS1Hr1LDI/edit). Define SIGE-H, web+móvil, intranet/Docker, migración de balance de personal, asistencia e incidencias.
- [Especificación de requerimientos P2-I03](https://docs.google.com/document/d/1SHDrxu1wuy6M6eF8wnOjoD7qIOCSekpbGB9a31DigWU/edit). Define RF-001 pase de lista Android, RF-002 asignación drag-and-drop, RF-003 ausencias previstas, RF-004 semáforo, RF-005 PDF; RNF-001 offline y RNF-002 auditoría. **Documento en revisión**: no confundir “validado por fuente” con autorización institucional final.
- [Alcance y criterios P2-I04](https://docs.google.com/document/d/1atJrbViPSFovtZE_wKVs76MusbQjjjnb2J-AVwEpuUA/edit). Entregables Android/Web/Backend/Reportes, excluye nómina y app iOS en la fase académica, propone criterios de tiempo.
- [Plan de calidad y pruebas P2-I09](https://docs.google.com/document/d/1X4bu2XltVEkIIHbTjI2nZOP0QcEAMeGQS3BQeRr8fTM/edit). Criterios verificables y separación entre pruebas previstas y resultados reales.
- [Definición y casos de uso UML](https://docs.google.com/document/d/17YJtaiOmZJ4-OWC3v1sgQf0AAuBN4wir3kJ3DaocIGE/edit). Menciona oficios/actas y supervisión normativa, que **no tienen tablas en el SQL maestro V1**: se tratan aquí como backlog condicionado, no como funcionalidades ya implementadas.

### 1.3 Google Drive: Balance de personal y coordinación

- [Carpeta JIM Plataformas](https://drive.google.com/drive/folders/1OigWJjjedYA1-WETWMosRS9KjZXSWNst): agrupación de formatos operativos.
- [Balance BP-2025 — Antonio Arias](https://docs.google.com/spreadsheets/d/1eNXKx2CzAe8x_XRk3WMUiIrewOBHJcE45GOpuatSWA0/edit): pestañas MATUTINO, VESPERTINO, NOCTURNO, TEMPORALES, DATOS e INSTRUCCIONES. Su registro por fila combina asistencia “A”, falta, causa, convenio “C”, sustituto, cambios internos y observaciones. **No replicar su regla de “sin A = falta inmediata”**: en SIGE-H la ausencia necesita pase/validación; mientras tanto sigue PENDIENTE.
- [Ausentismo y cobertura TM 2026](https://docs.google.com/spreadsheets/d/1snoTvzWTOu5rzjBuc816rrgE1gPW-QyOB-52rpa4m0A/edit): pestañas diarias, ANÁLISIS, PLAN. TEM, ASISTENCIA TEM, ASISTENCIA TEM FESTIVOS, FESTIVOS BASE, IMPRIMIR. Indicadores observados: plantilla, asistencias, faltas, cubiertas, sin cubrir, cambios internos, convenios, porcentajes. **Sus fórmulas requieren homologación de denominadores**, no copiar porcentajes automáticamente.
- [Ausentismo/ cobertura por turno](https://drive.google.com/drive/folders/1IBmIzjL6j92z606xVlgGgkz1rm3BMnqE): subcarpetas TM, TV, TN, con archivos mensuales.
- [Plantilla de Recursos Humanos 24 horas](https://docs.google.com/spreadsheets/d/1LmhklivJtNZalWqC6y2YS3xMIZ-JmgTnL8RluwrmA6U/edit): columnas RUD, ingreso/término, plaza, categoría, turno, días, horario, horas y descansos.
- [Plantilla Coordinación](https://docs.google.com/spreadsheets/d/1eG3RVI1ANJwoZamooTrq8eVG7huxjVrKKwopmUisHUs/edit): plantilla RH vs distribución por día, adscripción, ubicación operativa y turnos. Se observaron horarios particulares diferentes de los cinco horarios semilla; el motor deberá admitir excepciones aprobadas.
- [Hoja de enlace Coordinación 2026](https://docs.google.com/spreadsheets/d/10rvcT3qAbquyNcgF59MTtQDEDhpJRlOWFI5nh4AW-I8/edit): camas autorizadas/reales, ocupación, graves, RCP, ventilación, alto flujo, CPAP/BiPAP, traqueostomías y hemocomponentes, con DASHBOARD_KPI. Abrir líneas futuras para productividad, CEyE, quirófanos y tocoquirúrgica cuando se valide su alcance.

> **Alerta de procedencia:** los balances inspeccionados están rotulados “Hospital Civil Fray Antonio Alcalde”, mientras que parte del contexto histórico menciona “Juan I. Menchaca”. **No fusionar ambos hospitales, sus plantillas ni identificadores**; la aplicación es multi-hospital con separación estricta, y toda importación debe identificar inequívocamente el hospital fuente. Este documento omite deliberadamente nombres y números RUD de trabajadores reales.

### 1.4 Convención de trazabilidad

`FUENTE → NEC/RF/RNF → CU-ID → Endpoint → Módulo → Tablas/Eventos → CA-ID → PR-ID`.

- Mantener identificadores legibles, estables y no reutilizables; usar `CU-<MOD>-<nn>`.
- Un endpoint puede servir a varios casos; el inventario no exige una ruta CRUD por fila de DDL.
- Cambios de alcance: versionar línea base, registrar decisión y modificar criterios/pruebas asociados.

## 2. Decisiones de negocio consolidadas

1. **Separación hospitalaria**: hospital → división → servicio → subárea opcional; perfiles y autorizaciones con ámbito/tiempo. Un usuario multihospital debe escoger ámbito explícito y recibir datos filtrados.
2. **Plantilla**: la dotación pertenece al **servicio**, no se replica al listar subáreas; rotaciones de empleados a subáreas generalmente mensuales.
3. **Personal**: un solo padrón de empleados; contratos BASE o EVENTUAL con vigencias. Categoría nominal ≠ función desempeñada ≠ competencia verificada.
4. **Horarios**: matutino 07:00–14:30; vespertino 14:00–21:00; guardia nocturna 20:00–07:30 del día siguiente; JA 07:00–19:00 o 09:00–21:00. Se permiten horarios particulares autorizados.
5. **Descansos ordinarios**: LM, MMi, MiJ, JV, VS, SD, DL; cinco días de trabajo y dos días consecutivos de descanso, respetando cruces semanales.
6. **Guardias nocturnas**: tres guardias semanales fijas (p. ej. LMiV, LJS, MJS, MJD, DMJ); **no rota automáticamente cada semana**. Las fechas sin guardia no son por defecto faltas ni descansos compensatorios; preservar alias locales con igual conjunto de días.
7. **Festivos**: si un eventual habitualmente descansa y se le autoriza trabajar en festivo, lo hace en su **turno habitual**, no en el opuesto. Ni compensación ni horas extra automáticas sin política.
8. **Asistencia**: PROGRAMADO ≠ PRESENTE ≠ INCORPORADO ≠ CUBIERTO. “Sin A” del formato heredado no es falta automática hasta validación; conservar eventos y correcciones.
9. **Incidencias**: licencia, incapacidad, vacaciones, permisos, onomástico, retardo, faltas y ausencias parciales se codifican por catálogo dinámico. Una plaza vacante es déficit estructural y no ausencia imputable a persona.
10. **Retroactividad**: la reclasificación administrativa posterior conserva lo sucedido, quién lo registró y la cobertura ejecutada. Cierre de balance histórico inmutable; rectificaciones mediante nueva versión.
11. **Convenios**: sustitución de turno por otro trabajador **sin obligación de intercambio futuro**, aceptada y autorizada antes de aplicar. El sustituto no se cuenta como una cobertura extra dos veces.
12. **Cambio de descanso**: una excepción por fechas cambia programación, **no** el patrón habitual. Cambio permanente usa nuevo período de vigencia y autorización.
13. **Pase de salida**: posible sin registro posterior de regreso; nunca fabricar hora. Diferenciar salida no verificada, regreso no verificado, sin regreso confirmado y regreso confirmado.
14. **Eventual**: estrategia **mixta**, preasignaciones para déficits conocidos + reserva para imprevistos; presencia en Coordinación y recepción en servicio son verificaciones separadas.
15. **Cobertura**: la falta puede no generar déficit y el déficit puede no venir de una falta. Contabilizar necesidades por intervalo, servicio/subárea, categoría, competencia y complejidad; cobertura solo efectiva tras incorporación y aplicación confirmadas.
16. **Calidad**: hoja de enlace con información agregada; no prometer ratios NOM ni bloquear/asignar únicamente por categoría profesional sin matriz de competencias y decisión clínica institucional validada.
17. **Disciplina/oficios**: documentados como idea en material de proyecto, pero **sin soporte físico en DB V1**; requiere análisis de debido proceso, consentimiento/evidencia/firma y autorización formal; no sanciones automáticas ni “índices de confiabilidad” que decidan empleabilidad sin evaluación humana.

## 3. Arquitectura de desarrollo propuesta

```text
┌────────────────────────────┐       ┌──────────────────────────────┐
│ Web Angular / RxJS         │       │ Android Kotlin/Compose      │
│ Coordinación, Jefatura, RH │       │ Jefes piso, supervisión     │
│                            │       │ Room: cola offline          │
└────────────┬───────────────┘       └────────────┬─────────────────┘
             └─────────────────────┬──────────────┘
                                   │ HTTPS / OAuth2-OIDC / JWT
                         ┌─────────▼─────────────┐
                         │ Reverse proxy / BFF  │
                         │ Rate-limit, TLS      │
                         │ rutas /api/v1        │
                         └─────────┬─────────────┘
                                   │
                         ┌─────────▼─────────────┐
                         │ NestJS modular        │
                         │ Guards + Policy ACL   │
                         │ Controllers + DTOs    │
                         │ Application services  │
                         │ Domain models/rules   │
                         │ Repositories/Gateways │
                         │ WS Gateway (solo push)│
                         └─────────┬─────────────┘
                            ┌──────┼─────────┐
                            ▼      ▼         ▼
                       PostgreSQL Storage   Outbox/Jobs
                       esquema sigeh seguro  (gradual)
```

**Tres significados distintos de “gateway”**:

- **Gateway HTTP/BFF**: punto único de entrada, TLS, límites, versionado y encaminamiento; puede iniciar como proxy delante del mismo NestJS. No requiere desplegar microservicios.
- **NestJS WebSocket Gateway**: `balances.actualizados`, `necesidad.creada`, `asignacion.actualizada`, `incidencia.validada`. Solo publica **identificadores + versión** en salas por ámbito; clientes recuperan el estado autorizado vía REST. El WebSocket **no ejecuta asignaciones** ni sustituye transacciones HTTP.
- **Gateways por puertos/adaptadores**: interfaces de dominio `PersonalRepository`, `CoberturaRepository`, `StorageGateway`, `NotificationGateway`, `IdentityGateway`, `ClockGateway`, implementadas por Prisma/TypeORM/SQL, almacenamiento de objetos y mensajería.

**Patrón elegido**: monolito modular + servicios de aplicación transaccionales + capa de dominio. Si en el futuro los equipos y cargas lo justifican, extraer módulos por eventos publicados en outbox. No acoplar dos módulos escribiendo tablas ajenas directamente; usar interfaces del módulo propietario.

### 3.1 Estructura sugerida de repositorio

```text
sige-h/
  apps/
    api/                   # NestJS, /api/v1
    web/                   # Angular, panel administrativo
    mobile/                # Kotlin/Jetpack Compose, Room + WorkManager
  packages/
    api-contracts/         # OpenAPI 3.1 generado / clientes tipados
    shared-definitions/    # Códigos públicos, errores, validación de dominios
  infra/
    docker/                # Compose, Postgres, reverse proxy, observabilidad
    migrations/            # SQL incremental versionado, NO reejecutar SQL maestro en prod
  docs/
    casos-uso/             # Este documento y diagramas de secuencia
    arquitectura/          # ADRs: módulos, multi-hospital, disponibilidad/offline
    pruebas/               # CA / PR con resultados fechados
```

### 3.2 Capas y contratos del módulo NestJS

```text
modules/cobertura/
  api/             cobertura.controller.ts, dto/, cobertura.gateway.ts
  application/     validar-necesidad.usecase.ts, asignar-eventual.usecase.ts
  domain/          necesidad.aggregate.ts, policy/, events/
  infrastructure/  postgres.repository.ts, outbox.publisher.ts
  cobertura.module.ts
```

- **Modelos**: entidades/agregados y objetos de valor (`IntervaloLaboral`, `AlcanceHospitalario`, `PerfilCompetencial`, `Dotacion`, `EstadoMovimiento`) con invariantes. No usar entidades ORM como única fuente de reglas.
- **Use cases/commands**: validar, aprobar, aplicar, cerrar, rectificar; transacciones atómicas y registro de auditoría/outbox en el mismo commit.
- **DTOs**: contratos de entrada versionados, validación estricta, `class-validator`/Zod según elección del equipo; rechazo de campos inesperados sensibles.
- **Repositorios/gateways**: consultas acotadas por hospital; utilizar PostgreSQL `tstzrange`, exclusiones y locks donde aplique.
- **Read models**: vistas/consultas para matriz diaria y dashboards; lecturas no mutan historial.

### 3.3 Mapa de propiedad de tablas (SQL V1)

| Módulo | Tablas V1 existentes | Déficit funcional conocido |
|---|---|---|
| Organización | `hospitales`, `divisiones`, `servicios`, `subareas` | catálogo de responsabilidades y autorizaciones interhospitalarias |
| Personal | `empleados`, `contratos`, `categorias`, `funciones`, `competencias`, `adscripciones`, `empleado_funciones`, `empleado_competencias` | versionado explícito de categoría; documentación sensible y vigencias complejas |
| IAM | `usuarios`, `roles`, `permisos`, `rol_permisos`, `usuario_roles` | login/refresh, hash de contraseñas o IdP, sesiones, políticas RLS/ACL, elevación de permisos |
| Plantillas | `plantilla_servicio`, `rotaciones_subarea` | plazas vacantes de forma propia, versiones de objetivo |
| Programación | `horarios`, `patrones_laborales`, `patron_dias`, `empleado_patrones`, `calendario_festivos`, `programacion_laboral` | generador de jornadas, reglas de descansos, catálogos particulares, simulaciones |
| Asistencia | `registros_asistencia`, `eventos_asistencia` | lote offline, pase de lista como flujo, control de sincronización |
| Incidencias | `tipos_incidencia`, `incidencias`, `incidencia_jornadas`, `incidencia_versiones`, `incidencia_autorizaciones`, `incidencia_documentos` | versionado automático y permisos jerárquicos; archivos seguros |
| Movimientos | `movimientos_laborales`, `movimiento_decisiones`, `movimiento_eventos`, `convenios_sustitucion`, `cambios_descanso`, `pases_salida`, `efectos_programacion_movimiento` | orquestadores atómicos, evitar aplicación/reversión sin autoridad |
| Demanda asistencial | `indicadores_complejidad`, `mediciones_complejidad` | censo y productividad con granularidad por turno, métricas validadas |
| Eventuales | `disponibilidad_eventual` | validación presencia, idempotencia y reserva/preasignación formal |
| Cobertura | `necesidades_cobertura`, `necesidad_competencias`, `asignaciones_operativas`, `incorporaciones_servicio`, `aplicaciones_cobertura`, `movimientos_operativos` | evitar exceso, doble asignación, compatibilidad real y concurrencia |
| Balance y auditoría | `cierres_balance`, `auditoria_general` | reportes deterministas versionados, read models, log de decisiones |
| Documental, importación, notificaciones | **sin tablas propias en V1** | diseñar migración V2 antes de endpoints `FUT` |

## 4. Actores y autorización

| Actor (lógico) | Ámbito típico | Acciones principales | Limitación crítica |
|---|---|---|---|
| Administrador técnico | hospital explícito o infraestructura | administrar cuentas y catálogos técnicos | no autoriza incidencias o sanciones por ser DBA |
| Recursos Humanos | hospital | contratos, categorías, vigencias, conciliación y reclasificación | no reescribe asistencia histórica ni autoriza coberturas por defecto |
| Jefatura de Enfermería | hospital | políticas autorizadas, cierres extraordinarios, indicadores y excepciones | acciones sujetas a delegación formal |
| Coordinación de Enfermería | hospital / turno | reserva/eventuales, asignación, redistribución, balance de cobertura | no confirma incorporación en nombre del servicio sin evidencia |
| Supervisión divisional | división/turno | validar asistencias, necesidades y movimientos autorizados | no puede actuar sobre divisiones ajenas |
| Jefe titular de servicio | servicio/turno | pase, rotación, incidencias, recepción, solicitudes | no suplanta actos exclusivos de RRHH/Coordinación |
| Encargado de servicio | servicio/turno/fecha de encargo | captura/validación limitada por mandato | no hereda automáticamente las atribuciones del titular |
| Personal base/eventual | cuenta propia | consultar programación, solicitudes, acuses | no puede aceptar por un tercero ni certificar su propia incorporación |
| Dirección/Jurídico/Auditoría | ámbitos expresamente otorgados | reportes, expedientes autorizados y revisión documental | mínima divulgación y segregación de funciones |
| Trabajador móvil offline | ámbito cacheado/caducidad | capturas locales pendientes | no realiza decisiones administrativas definitivas sin servidor |

**Implementación obligatoria antes de producción:** `JwtAuthGuard` + `PermissionGuard` + `ScopeGuard` + `PolicyEngine` con checks hospital/división/servicio/turno/vigencia + denegación por defecto. No confiar en `hospitalId` recibido en cuerpo: cotejar con alcance de sesión y FK. Considerar RLS PostgreSQL como defensa en profundidad tras diseñar contexto `SET LOCAL app.hospital_id` y roles DB **no superusuario**. Registro `403` denegado y prueba negativa cross-hospital por cada módulo. `usuario_roles` actual permite combinaciones de ámbito que deberán validarse coherentemente en app/DB.

## 5. Inventario de casos de uso y endpoints propuestos

**Cobertura del inventario:** 18 módulos; **271 casos de uso**; **270 combinaciones método+ruta únicas** (algunas rutas se reutilizan intencionalmente por acciones similares); estados: AC=99, PROP=123, FUT=49; prioridades P0=188, P1=57, P2=26.



**Cómo leer cada fila:** `CU-ID` = caso de uso; `Actor` = iniciador principal; `REST` = contrato sugerido bajo prefijo `/api/v1`; `Prioridad` = propuesta; `Estado` = ver glosario inicial. La ruta indica **recurso/intención**, no que ya exista controlador ni migración.

### 5.1 IAM — Identidad, usuarios y autorizaciones

**Origen/estado:** CONFIRMADO + PROPUESTA. **Tablas:** `usuarios, roles, permisos, rol_permisos, usuario_roles`.

Autenticación, revocación y alcance hospital/división/servicio con vigencia. Los catálogos SQL actuales NO bastan para RBAC efectivo.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-IAM-01` | Iniciar sesión y emitir tokens | Operador | `POST /auth/login` | P0 | AC |
| `CU-IAM-02` | Renovar token | Operador | `POST /auth/refresh` | P0 | AC |
| `CU-IAM-03` | Cerrar sesión y revocar sesión | Operador | `POST /auth/logout` | P0 | AC |
| `CU-IAM-04` | Consultar perfil y alcances propios | Operador | `GET /auth/me` | P0 | AC |
| `CU-IAM-05` | Listar sesiones activas del usuario | Operador | `GET /auth/sessions` | P1 | PROP |
| `CU-IAM-06` | Revocar sesión en otro dispositivo | Operador | `DELETE /auth/sessions/{sessionId}` | P1 | PROP |
| `CU-IAM-07` | Dar de alta cuenta de acceso | Administrador | `POST /usuarios` | P0 | AC |
| `CU-IAM-08` | Consultar y filtrar cuentas | Administrador | `GET /usuarios` | P0 | AC |
| `CU-IAM-09` | Modificar o bloquear cuenta | Administrador | `PATCH /usuarios/{usuarioId}` | P0 | AC |
| `CU-IAM-10` | Listar roles y permisos | Administrador | `GET /roles` | P0 | AC |
| `CU-IAM-11` | Asignar rol y alcance temporal | Administrador | `POST /usuarios/{usuarioId}/roles` | P0 | AC |
| `CU-IAM-12` | Revocar asignación de rol | Administrador | `DELETE /usuarios/{usuarioId}/roles/{usuarioRolId}` | P0 | AC |
| `CU-IAM-13` | Consultar permisos efectivos de usuario | Administrador | `GET /usuarios/{usuarioId}/permisos-efectivos` | P0 | PROP |
| `CU-IAM-14` | Consultar matriz de autorizaciones vigente | Autoridad | `GET /politicas-autorizacion` | P0 | PROP |
| `CU-IAM-15` | Aprobar/revisar cambio de matriz de autorización | Jefatura | `POST /politicas-autorizacion/versiones` | P1 | PROP |
| `CU-IAM-16` | Consultar auditoría de accesos denegados | Auditor | `GET /auditorias/accesos` | P1 | PROP |

### 5.2 ORG — Organización hospitalaria

**Origen/estado:** CONFIRMADO. **Tablas:** `hospitales, divisiones, servicios, subareas`.

Jerarquía fija hospital → división → servicio → subárea opcional. El servicio es la unidad de plantilla; no asumir la misma institución por títulos de archivos de ejemplo.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ORG-01` | Listar hospitales visibles | Operador | `GET /hospitales` | P0 | AC |
| `CU-ORG-02` | Crear hospital | Administrador | `POST /hospitales` | P1 | PROP |
| `CU-ORG-03` | Editar configuración hospital, huso y estado | Administrador | `PATCH /hospitales/{hospitalId}` | P0 | AC |
| `CU-ORG-04` | Consultar divisiones por hospital | Operador | `GET /hospitales/{hospitalId}/divisiones` | P0 | AC |
| `CU-ORG-05` | Crear división | Administrador | `POST /divisiones` | P0 | AC |
| `CU-ORG-06` | Actualizar división | Administrador | `PATCH /divisiones/{divisionId}` | P0 | AC |
| `CU-ORG-07` | Listar servicios y jerarquía | Operador | `GET /servicios` | P0 | AC |
| `CU-ORG-08` | Crear servicio bajo división | Administrador | `POST /servicios` | P0 | AC |
| `CU-ORG-09` | Modificar servicio o desactivarlo | Administrador | `PATCH /servicios/{servicioId}` | P0 | AC |
| `CU-ORG-10` | Listar subáreas por servicio | Operador | `GET /servicios/{servicioId}/subareas` | P0 | AC |
| `CU-ORG-11` | Crear subárea | Administrador | `POST /subareas` | P1 | AC |
| `CU-ORG-12` | Modificar subárea o desactivarla | Administrador | `PATCH /subareas/{subareaId}` | P1 | AC |
| `CU-ORG-13` | Consultar árbol de organización para filtros | Operador | `GET /organizacion/arbol` | P0 | PROP |

### 5.3 PER — Padrón, contratos y competencias

**Origen/estado:** CONFIRMADO. **Tablas:** `empleados, contratos, categorias, funciones, competencias, adscripciones, empleado_funciones, empleado_competencias`.

Una persona puede tener contratos BASE/EVENTUAL con historial. Distinguir categoría nominal, función asignada y competencia verificada; RUD único.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-PER-01` | Alta de empleado con RUD único | RRHH | `POST /empleados` | P0 | AC |
| `CU-PER-02` | Buscar y paginar padrón por RUD, categoría, estado | RRHH | `GET /empleados` | P0 | AC |
| `CU-PER-03` | Consultar expediente laboral | RRHH | `GET /empleados/{empleadoId}` | P0 | AC |
| `CU-PER-04` | Actualizar datos no inmutables | RRHH | `PATCH /empleados/{empleadoId}` | P0 | AC |
| `CU-PER-05` | Inactivar empleado sin borrado | RRHH | `POST /empleados/{empleadoId}/inactivar` | P0 | AC |
| `CU-PER-06` | Registrar contrato base o eventual | RRHH | `POST /empleados/{empleadoId}/contratos` | P0 | AC |
| `CU-PER-07` | Consultar historial de contratos | RRHH | `GET /empleados/{empleadoId}/contratos` | P0 | AC |
| `CU-PER-08` | Suspender/cerrar contrato con vigencia | RRHH | `POST /contratos/{contratoId}/cerrar` | P0 | AC |
| `CU-PER-09` | Registrar cambio histórico de categoría | RRHH | `POST /contratos/{contratoId}/cambios-categoria` | P1 | PROP |
| `CU-PER-10` | Consultar categorías | Operador | `GET /categorias` | P0 | AC |
| `CU-PER-11` | Administrar categorías | Administrador | `POST /categorias` | P1 | AC |
| `CU-PER-12` | Consultar funciones | Operador | `GET /funciones` | P0 | AC |
| `CU-PER-13` | Administrar funciones | Administrador | `POST /funciones` | P1 | AC |
| `CU-PER-14` | Consultar competencias | Operador | `GET /competencias` | P0 | AC |
| `CU-PER-15` | Administrar competencias | Administrador | `POST /competencias` | P1 | AC |
| `CU-PER-16` | Registrar adscripción nominal/operativa | RRHH | `POST /contratos/{contratoId}/adscripciones` | P0 | AC |
| `CU-PER-17` | Consultar historial de adscripciones | RRHH | `GET /contratos/{contratoId}/adscripciones` | P0 | AC |
| `CU-PER-18` | Asignar función efectiva con vigencia | Jefatura | `POST /empleados/{empleadoId}/funciones` | P1 | AC |
| `CU-PER-19` | Validar competencia con vigencia/evidencia | Supervisor | `POST /empleados/{empleadoId}/competencias` | P0 | AC |
| `CU-PER-20` | Consultar competencias vigentes para un intervalo | Coordinación | `GET /empleados/{empleadoId}/competencias-vigentes` | P0 | PROP |
| `CU-PER-21` | Consultar elegibilidad de un empleado para servicio/turno | Coordinación | `POST /empleados/{empleadoId}/evaluar-elegibilidad` | P0 | PROP |
| `CU-PER-22` | Consultar expediente propio restringido | Empleado | `GET /mi-expediente` | P2 | PROP |

### 5.4 DOT — Plantilla, plazas y rotaciones

**Origen/estado:** CONFIRMADO + PROPUESTA. **Tablas:** `plantilla_servicio, rotaciones_subarea, adscripciones`.

Plantilla por servicio/categoría/turno; subáreas son destinos operativos sin duplicar dotación. Plaza vacante es fuente de necesidad, no falta individual.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-DOT-01` | Consultar plantilla objetivo del servicio | Jefatura | `GET /servicios/{servicioId}/plantilla` | P0 | AC |
| `CU-DOT-02` | Registrar dotación objetivo por categoría/turno | Jefatura | `POST /servicios/{servicioId}/plantilla` | P0 | AC |
| `CU-DOT-03` | Versionar/corregir plantilla con vigencia | Jefatura | `POST /plantillas/{plantillaId}/versiones` | P1 | PROP |
| `CU-DOT-04` | Consultar brecha plantilla contra personal contratado | Coordinación | `GET /servicios/{servicioId}/brecha-plantilla` | P0 | PROP |
| `CU-DOT-05` | Registrar plaza vacante y vigencia | RRHH | `POST /plazas-vacantes` | P1 | FUT |
| `CU-DOT-06` | Listar vacantes por hospital/servicio | RRHH | `GET /plazas-vacantes` | P1 | FUT |
| `CU-DOT-07` | Programar rotación mensual por subárea | Jefe servicio | `POST /rotaciones-subarea` | P0 | AC |
| `CU-DOT-08` | Consultar rotaciones mensuales | Supervisor | `GET /rotaciones-subarea` | P0 | AC |
| `CU-DOT-09` | Modificar rotación antes de vigencia | Jefe servicio | `PATCH /rotaciones-subarea/{rotacionId}` | P0 | AC |
| `CU-DOT-10` | Validar sumatoria sin doble conteo entre subáreas | Coordinación | `GET /servicios/{servicioId}/distribucion` | P0 | PROP |
| `CU-DOT-11` | Comparar plantilla RH y Coordinación | RRHH | `GET /conciliaciones/plantilla` | P1 | PROP |
| `CU-DOT-12` | Emitir observación de conciliación | RRHH | `POST /conciliaciones/plantilla/observaciones` | P1 | PROP |

### 5.5 CAL — Horarios, patrones, guardias, festivos y programación

**Origen/estado:** CONFIRMADO. **Tablas:** `horarios, patrones_laborales, patron_dias, empleado_patrones, calendario_festivos, programacion_laboral`.

Matutino 07:00-14:30; vespertino 14:00-21:00; nocturno 20:00-07:30 cruzando día, 3 guardias fijas por semana; JA 07-19 o 09-21. El horario individual puede variar por hospital/servicio; no forzar el inicial de catálogo.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-CAL-01` | Listar horarios configurables | Operador | `GET /horarios` | P0 | AC |
| `CU-CAL-02` | Crear horario autorizado | Administrador | `POST /horarios` | P1 | AC |
| `CU-CAL-03` | Listar patrones y sus siete días | Operador | `GET /patrones-laborales` | P0 | AC |
| `CU-CAL-04` | Crear patrón adicional manteniendo vigencia | Administrador | `POST /patrones-laborales` | P1 | AC |
| `CU-CAL-05` | Asignar patrón de descanso a contrato | RRHH | `POST /contratos/{contratoId}/patrones` | P0 | AC |
| `CU-CAL-06` | Consultar historial de patrones de contrato | Jefatura | `GET /contratos/{contratoId}/patrones` | P0 | AC |
| `CU-CAL-07` | Cambiar patrón permanente con aprobación | Jefatura | `POST /contratos/{contratoId}/cambiar-patron` | P0 | PROP |
| `CU-CAL-08` | Listar festivos por hospital | Operador | `GET /calendario-festivos` | P0 | AC |
| `CU-CAL-09` | Crear festivo oficial hospitalario | Administrador | `POST /calendario-festivos` | P1 | AC |
| `CU-CAL-10` | Generar calendario laboral desde patrones y contratos | Jefatura | `POST /programaciones/generar` | P0 | PROP |
| `CU-CAL-11` | Simular programación sin persistir | Jefatura | `POST /programaciones/simular` | P0 | PROP |
| `CU-CAL-12` | Consultar programación por servicio, día y turno | Operador | `GET /programaciones` | P0 | AC |
| `CU-CAL-13` | Consultar programación de empleado | Operador | `GET /empleados/{empleadoId}/programaciones` | P0 | AC |
| `CU-CAL-14` | Registrar jornada extraordinaria autorizada | Supervisor | `POST /programaciones/extraordinarias` | P0 | PROP |
| `CU-CAL-15` | Cancelar programación conservando historia | Jefatura | `POST /programaciones/{programacionId}/cancelar` | P0 | PROP |
| `CU-CAL-16` | Validar solapes, vigencias y descanso legal/política | Jefatura | `POST /programaciones/validar` | P0 | PROP |
| `CU-CAL-17` | Publicar rol del periodo con control de versión | Jefatura | `POST /programaciones/publicaciones` | P1 | PROP |
| `CU-CAL-18` | Consultar diferencias entre versión publicada y cambios | Supervisor | `GET /programaciones/diferencias` | P1 | PROP |
| `CU-CAL-19` | Consultar guardias nocturnas fijas y excepciones | Supervisor | `GET /programaciones/guardias-nocturnas` | P0 | PROP |
| `CU-CAL-20` | Programar acumulada en festivo según esquema individual | Jefatura | `POST /programaciones/festivos` | P1 | PROP |
| `CU-CAL-21` | Previsualizar ausencias conocidas futuras | Coordinación | `GET /programaciones/prevision-ausencias` | P0 | PROP |

### 5.6 ASI — Pase de lista y eventos de asistencia

**Origen/estado:** CONFIRMADO. **Tablas:** `registros_asistencia, eventos_asistencia, programacion_laboral`.

No transformar automáticamente toda celda sin A en falta: PENDIENTE hasta pase validado. Captura móvil offline, idempotencia y servidor como autoridad.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ASI-01` | Consultar pase de lista del servicio/turno | Jefe servicio | `GET /pases-lista` | P0 | AC |
| `CU-ASI-02` | Capturar asistencia por jornada | Jefe servicio | `PUT /programaciones/{programacionId}/asistencia` | P0 | AC |
| `CU-ASI-03` | Capturar lote offline idempotente | Jefe servicio | `POST /asistencias/lotes` | P0 | PROP |
| `CU-ASI-04` | Registrar evento de llegada, salida o corrección | Jefe servicio | `POST /asistencias/{asistenciaId}/eventos` | P0 | AC |
| `CU-ASI-05` | Marcar ausencia pendiente de justificar | Jefe servicio | `POST /asistencias/{asistenciaId}/ausencia` | P0 | AC |
| `CU-ASI-06` | Corregir captura conservando evento original | Jefe servicio | `POST /asistencias/{asistenciaId}/correcciones` | P0 | PROP |
| `CU-ASI-07` | Consultar estado actual y eventos | Supervisor | `GET /asistencias/{asistenciaId}` | P0 | AC |
| `CU-ASI-08` | Validar pase de lista por servicio/turno | Supervisor | `POST /pases-lista/{paseListaId}/validar` | P0 | PROP |
| `CU-ASI-09` | Observar/devolver pase de lista | Supervisor | `POST /pases-lista/{paseListaId}/observar` | P0 | PROP |
| `CU-ASI-10` | Publicar estado validado a Coordinación | Supervisor | `POST /pases-lista/{paseListaId}/liberar` | P0 | PROP |
| `CU-ASI-11` | Ver discrepancia entre presencia hospital e incorporación | Coordinación | `GET /asistencias/discrepancias` | P1 | PROP |
| `CU-ASI-12` | Consultar bitácora de correcciones y autor | Auditor | `GET /asistencias/{asistenciaId}/historial` | P0 | AC |
| `CU-ASI-13` | Sincronizar cambios móviles con conflictos | Móvil | `POST /sincronizacion/asistencias` | P0 | PROP |
| `CU-ASI-14` | Consultar estado de solicitudes offline | Móvil | `GET /sincronizacion/lotes/{loteId}` | P0 | PROP |
| `CU-ASI-15` | Registrar verificación de presencia en Coordinación | Coordinación | `POST /presencias-coordinacion` | P0 | PROP |

### 5.7 INC — Calendario de incidencias y autorizaciones

**Origen/estado:** CONFIRMADO. **Tablas:** `tipos_incidencia, incidencias, incidencia_jornadas, incidencia_versiones, incidencia_autorizaciones, incidencia_documentos`.

Diferenciar ausencia real, clasificación administrativa y déficit. Reclasificación retroactiva NO reescribe historia operativa ni cierre.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-INC-01` | Consultar catálogo institucional de incidencias | Operador | `GET /tipos-incidencia` | P0 | AC |
| `CU-INC-02` | Administrar tipo configurable de incidencia | Administrador | `POST /tipos-incidencia` | P1 | AC |
| `CU-INC-03` | Registrar incidencia por periodo | Jefe servicio | `POST /incidencias` | P0 | AC |
| `CU-INC-04` | Consultar incidencias con filtros | Supervisor | `GET /incidencias` | P0 | AC |
| `CU-INC-05` | Consultar incidencia y versiones | Supervisor | `GET /incidencias/{incidenciaId}` | P0 | AC |
| `CU-INC-06` | Relacionar jornadas afectadas | Jefe servicio | `POST /incidencias/{incidenciaId}/jornadas` | P0 | AC |
| `CU-INC-07` | Enviar incidencia a revisión | Jefe servicio | `POST /incidencias/{incidenciaId}/enviar` | P0 | PROP |
| `CU-INC-08` | Autorizar o rechazar con facultad | Autoridad | `POST /incidencias/{incidenciaId}/decisiones` | P0 | AC |
| `CU-INC-09` | Adjuntar justificante con hash | Jefe servicio | `POST /incidencias/{incidenciaId}/documentos` | P0 | AC |
| `CU-INC-10` | Consultar o descargar justificante autorizado | RRHH | `GET /incidencias/{incidenciaId}/documentos/{documentoId}` | P0 | PROP |
| `CU-INC-11` | Reclasificar retroactivamente con nueva versión | RRHH | `POST /incidencias/{incidenciaId}/reclasificaciones` | P0 | PROP |
| `CU-INC-12` | Consultar versiones con fecha efectiva y registro | Auditor | `GET /incidencias/{incidenciaId}/versiones` | P0 | AC |
| `CU-INC-13` | Consultar calendario de incidencias servicio/división | Supervisor | `GET /incidencias/calendario` | P0 | PROP |
| `CU-INC-14` | Consultar incidencias administrativas vs operativas | RRHH | `GET /incidencias/conciliacion` | P0 | PROP |
| `CU-INC-15` | Cancelar con motivo sin borrar antecedentes | Autoridad | `POST /incidencias/{incidenciaId}/cancelar` | P1 | PROP |
| `CU-INC-16` | Generar alertas por vencimientos/documentos faltantes | RRHH | `GET /incidencias/alertas` | P1 | PROP |
| `CU-INC-17` | Consultar periodo de incapacidad/licencia/vacaciones futuro | Coordinación | `GET /incidencias/prevision` | P0 | PROP |
| `CU-INC-18` | Emitir reporte de ausentismo por causas y turnos | RRHH | `GET /reportes/ausentismo` | P0 | PROP |

### 5.8 MOV — Convenios, cambios de descanso y pases de salida

**Origen/estado:** CONFIRMADO. **Tablas:** `movimientos_laborales, movimiento_decisiones, movimiento_eventos, convenios_sustitucion, cambios_descanso, pases_salida, efectos_programacion_movimiento`.

Convenio es sustitución SIN reciprocidad obligatoria. Pase de salida permite regreso NULL. Cambios ocasionales preservan patrón; permanentes afectan empleado_patrones.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-MOV-01` | Solicitar convenio sustitución sin intercambio futuro | Empleado | `POST /movimientos/convenios` | P0 | AC |
| `CU-MOV-02` | Registrar aceptación del sustituto | Sustituto | `POST /movimientos/{movimientoId}/aceptar` | P0 | PROP |
| `CU-MOV-03` | Consultar convenio y sus jornadas | Supervisor | `GET /movimientos/{movimientoId}` | P0 | AC |
| `CU-MOV-04` | Revisar elegibilidad del sustituto | Coordinación | `POST /movimientos/{movimientoId}/validar-convenio` | P0 | PROP |
| `CU-MOV-05` | Autorizar/rechazar convenio | Autoridad | `POST /movimientos/{movimientoId}/decisiones` | P0 | AC |
| `CU-MOV-06` | Aplicar convenio a programaciones de forma atómica | Coordinación | `POST /movimientos/{movimientoId}/aplicar` | P0 | PROP |
| `CU-MOV-07` | Revertir convenio autorizadamente con auditoría | Autoridad | `POST /movimientos/{movimientoId}/revertir` | P0 | PROP |
| `CU-MOV-08` | Solicitar cambio ocasional de descanso | Empleado | `POST /movimientos/cambios-descanso` | P0 | AC |
| `CU-MOV-09` | Validar y simular nueva jornada/descanso | Supervisor | `POST /movimientos/{movimientoId}/simular` | P0 | PROP |
| `CU-MOV-10` | Aplicar cambio ocasional y conservar patrón | Autoridad | `POST /movimientos/{movimientoId}/aplicar-descanso` | P0 | PROP |
| `CU-MOV-11` | Solicitar pase de salida | Empleado | `POST /movimientos/pases-salida` | P0 | AC |
| `CU-MOV-12` | Autorizar pase de salida | Autoridad | `POST /movimientos/{movimientoId}/decisiones` | P0 | AC |
| `CU-MOV-13` | Registrar salida real | Jefe servicio | `POST /movimientos/{movimientoId}/registrar-salida` | P0 | PROP |
| `CU-MOV-14` | Registrar regreso real si se conoce | Jefe servicio | `POST /movimientos/{movimientoId}/registrar-regreso` | P0 | PROP |
| `CU-MOV-15` | Cerrar pase sin regreso confirmado | Supervisor | `POST /movimientos/{movimientoId}/cerrar-sin-regreso` | P0 | PROP |
| `CU-MOV-16` | Cerrar pase sin dato verificado | Supervisor | `POST /movimientos/{movimientoId}/cerrar-sin-dato` | P0 | PROP |
| `CU-MOV-17` | Consultar calidad de evidencia del pase | Supervisor | `GET /movimientos/{movimientoId}/evidencia` | P0 | PROP |
| `CU-MOV-18` | Cancelar/revocar movimiento con efecto histórico | Autoridad | `POST /movimientos/{movimientoId}/revocar` | P0 | PROP |
| `CU-MOV-19` | Consultar movimientos por periodo y tipo | Supervisor | `GET /movimientos` | P0 | AC |
| `CU-MOV-20` | Consultar eventos/decisiones inmutables | Auditor | `GET /movimientos/{movimientoId}/historial` | P0 | AC |

### 5.9 EVE — Reserva y disponibilidad del personal eventual

**Origen/estado:** CONFIRMADO. **Tablas:** `disponibilidad_eventual, contratos, empleado_competencias`.

Modelo mixto: preasignación de ausencias previstas + reserva presencial para imprevistos. Declaración, presencia validada e incorporación son eventos distintos.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-EVE-01` | Consultar eventuales elegibles con contrato vigente | Coordinación | `GET /eventuales` | P0 | AC |
| `CU-EVE-02` | Declarar disponibilidad eventual | Coordinación | `POST /eventuales/disponibilidades` | P0 | AC |
| `CU-EVE-03` | Verificar llegada real a Coordinación | Coordinación | `POST /eventuales/disponibilidades/{disponibilidadId}/validar-presencia` | P0 | AC |
| `CU-EVE-04` | Marcar indisponible/retiro | Coordinación | `POST /eventuales/disponibilidades/{disponibilidadId}/finalizar` | P0 | AC |
| `CU-EVE-05` | Consultar sala de espera por turno y competencias | Coordinación | `GET /eventuales/reserva` | P0 | PROP |
| `CU-EVE-06` | Consultar disponibilidades futuras y compromisos | Coordinación | `GET /eventuales/calendario` | P0 | PROP |
| `CU-EVE-07` | Reservar eventual para déficit previsto | Coordinación | `POST /eventuales/preasignaciones` | P0 | PROP |
| `CU-EVE-08` | Confirmar aceptación de preasignación | Eventual | `POST /eventuales/preasignaciones/{preasignacionId}/aceptar` | P1 | PROP |
| `CU-EVE-09` | Liberar reserva no utilizada | Coordinación | `POST /eventuales/preasignaciones/{preasignacionId}/liberar` | P0 | PROP |
| `CU-EVE-10` | Consultar disponibilidad con conflictos de horario | Coordinación | `POST /eventuales/evaluar-disponibilidad` | P0 | PROP |
| `CU-EVE-11` | Registrar ausencia del eventual preasignado | Jefe servicio | `POST /eventuales/preasignaciones/{preasignacionId}/no-presentado` | P0 | PROP |
| `CU-EVE-12` | Medir espera y tiempo de asignación | Coordinación | `GET /eventuales/metricas-espera` | P1 | PROP |

### 5.10 COB — Necesidades, asignaciones e incorporaciones y cobertura

**Origen/estado:** CONFIRMADO. **Tablas:** `necesidades_cobertura, necesidad_competencias, asignaciones_operativas, incorporaciones_servicio, aplicaciones_cobertura, movimientos_operativos`.

Necesidad no equivale a ausencia. La asignación no es cobertura: requiere incorporación comprobada y aplicación a intervalo/cantidad/perfil. Evitar sobrecobertura y doble asignación concurrente.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-COB-01` | Detectar déficit según plantilla y demanda | Coordinación | `POST /necesidades/evaluar` | P0 | PROP |
| `CU-COB-02` | Registrar necesidad por ausencia/plaza/complejidad | Supervisor | `POST /necesidades-cobertura` | P0 | AC |
| `CU-COB-03` | Consultar necesidades por estado y franja | Coordinación | `GET /necesidades-cobertura` | P0 | AC |
| `CU-COB-04` | Consultar detalle y perfil requerido | Coordinación | `GET /necesidades-cobertura/{necesidadId}` | P0 | AC |
| `CU-COB-05` | Validar o rechazar necesidad | Supervisor | `POST /necesidades-cobertura/{necesidadId}/validar` | P0 | PROP |
| `CU-COB-06` | Registrar competencias exigidas | Supervisor | `PUT /necesidades-cobertura/{necesidadId}/competencias` | P0 | AC |
| `CU-COB-07` | Sugerir candidatos compatibles sin autoasignar | Coordinación | `GET /necesidades-cobertura/{necesidadId}/candidatos` | P0 | PROP |
| `CU-COB-08` | Simular asignación y efectos en servicio origen | Coordinación | `POST /asignaciones/simular` | P0 | PROP |
| `CU-COB-09` | Crear asignación habitual/preasignación/reserva | Coordinación | `POST /asignaciones-operativas` | P0 | AC |
| `CU-COB-10` | Consultar asignaciones por turno/servicio | Coordinación | `GET /asignaciones-operativas` | P0 | AC |
| `CU-COB-11` | Confirmar asignación autorizada | Coordinación | `POST /asignaciones-operativas/{asignacionId}/confirmar` | P0 | PROP |
| `CU-COB-12` | Cancelar asignación con motivo | Coordinación | `POST /asignaciones-operativas/{asignacionId}/cancelar` | P0 | PROP |
| `CU-COB-13` | Verificar recepción real en servicio | Jefe servicio | `POST /asignaciones-operativas/{asignacionId}/incorporaciones` | P0 | AC |
| `CU-COB-14` | Confirmar fin efectivo de servicio | Jefe servicio | `POST /incorporaciones/{incorporacionId}/finalizar` | P0 | PROP |
| `CU-COB-15` | Aplicar incorporación a necesidad en intervalo | Coordinación | `POST /necesidades-cobertura/{necesidadId}/aplicaciones` | P0 | AC |
| `CU-COB-16` | Anular aplicación errónea conservando traza | Autoridad | `POST /aplicaciones-cobertura/{aplicacionId}/anular` | P0 | PROP |
| `CU-COB-17` | Consultar déficit efectivo remanente por intervalo | Coordinación | `GET /necesidades-cobertura/{necesidadId}/remanente` | P0 | PROP |
| `CU-COB-18` | Transferir persona entre servicios con autorización | Supervisor | `POST /movimientos-operativos` | P0 | AC |
| `CU-COB-19` | Confirmar recepción en nuevo servicio | Jefe servicio | `POST /movimientos-operativos/{movimientoOperativoId}/recepcion` | P0 | PROP |
| `CU-COB-20` | Consultar mapa de cobertura consolidado | Coordinación | `GET /cobertura/mapa` | P0 | PROP |
| `CU-COB-21` | Consultar alertas de duplicidad, competencia e intervalos | Coordinación | `GET /cobertura/alertas` | P0 | PROP |
| `CU-COB-22` | Cerrar necesidad con déficit no cubierto documentado | Supervisor | `POST /necesidades-cobertura/{necesidadId}/cerrar` | P0 | PROP |
| `CU-COB-23` | Recalcular semáforo con criterios institucionales vigentes | Coordinación | `POST /cobertura/recalcular` | P1 | PROP |
| `CU-COB-24` | Listar órdenes de movimientos internas del turno | Supervisor | `GET /movimientos-operativos` | P0 | AC |

### 5.11 ASI_CLIN — Ocupación, complejidad y productividad / enlace de turno

**Origen/estado:** CONFIRMADO + PROPUESTA. **Tablas:** `indicadores_complejidad, mediciones_complejidad; nuevas entidades aún no modeladas`.

Fuentes de hoja de enlace: camas autorizadas/reales, ocupación, graves, RCP, ventilación, alto flujo, CPAP/BiPAP, traqueostomía, hemocomponentes, cirugías, hemodiálisis, CEyE, etc. Indicadores deben ser configurables y no contener identidad clínica en MVP.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ASI_CLIN-01` | Consultar catálogo de indicadores asistenciales | Supervisor | `GET /indicadores-complejidad` | P0 | AC |
| `CU-ASI_CLIN-02` | Administrar indicador y unidad | Administrador | `POST /indicadores-complejidad` | P1 | AC |
| `CU-ASI_CLIN-03` | Capturar medición por subárea/servicio e instante | Supervisor | `POST /mediciones-complejidad` | P0 | AC |
| `CU-ASI_CLIN-04` | Consultar series de complejidad por turno | Coordinación | `GET /mediciones-complejidad` | P0 | AC |
| `CU-ASI_CLIN-05` | Registrar censo agregado de camas/ocupación | Jefe servicio | `POST /censos-camas` | P1 | FUT |
| `CU-ASI_CLIN-06` | Consultar censo por servicio/turno | Supervisor | `GET /censos-camas` | P1 | FUT |
| `CU-ASI_CLIN-07` | Registrar consumo agregado de hemocomponentes | Jefe servicio | `POST /productividad/hemocomponentes` | P2 | FUT |
| `CU-ASI_CLIN-08` | Registrar productividad quirúrgica | Jefe servicio | `POST /productividad/quirofanos` | P2 | FUT |
| `CU-ASI_CLIN-09` | Registrar productividad obstétrica | Jefe servicio | `POST /productividad/tocoquirurgica` | P2 | FUT |
| `CU-ASI_CLIN-10` | Registrar productividad de CEyE/esterilización | Jefe servicio | `POST /productividad/esterilizacion` | P2 | FUT |
| `CU-ASI_CLIN-11` | Registrar eventos y equipos de soporte asistencial agregados | Jefe servicio | `POST /complejidad/eventos` | P1 | FUT |
| `CU-ASI_CLIN-12` | Consultar hoja de enlace consolidada por turno | Coordinación | `GET /enlaces-turno` | P1 | FUT |
| `CU-ASI_CLIN-13` | Capturar/actualizar borrador de enlace | Supervisor | `POST /enlaces-turno` | P1 | FUT |
| `CU-ASI_CLIN-14` | Validar/firmar cierre de enlace | Coordinación | `POST /enlaces-turno/{enlaceId}/validar` | P1 | FUT |
| `CU-ASI_CLIN-15` | Consultar impacto de demanda sobre necesidades de cobertura | Coordinación | `GET /cobertura/justificacion-complejidad` | P1 | PROP |

### 5.12 BAL — Balance de personal, cortes y conciliación

**Origen/estado:** CONFIRMADO. **Tablas:** `cierres_balance, registros_asistencia, incidencias, aplicaciones_cobertura`.

Los formatos actuales separan asistencia, convenio, cambio interno, falta, motivo, suplente, cubiertas y sin cubrir. Mantener snapshot emitido y conciliación administrativa posterior, sin reescribirlo.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-BAL-01` | Consultar balance diario por servicio y turno | Supervisor | `GET /balances/diarios` | P0 | PROP |
| `CU-BAL-02` | Consultar balance de personal detallado con renglones | Jefe servicio | `GET /balances/diarios/{servicioId}/detalle` | P0 | PROP |
| `CU-BAL-03` | Previsualizar total programado vs asistencia y necesidades | Supervisor | `POST /balances/simular-cierre` | P0 | PROP |
| `CU-BAL-04` | Emitir cierre operativo versionado inmutable | Supervisor | `POST /balances/cierres` | P0 | AC |
| `CU-BAL-05` | Consultar cierres por servicio/fecha | Auditor | `GET /balances/cierres` | P0 | AC |
| `CU-BAL-06` | Consultar snapshot exacto emitido | Auditor | `GET /balances/cierres/{cierreId}` | P0 | AC |
| `CU-BAL-07` | Emitir rectificación como versión nueva | Autoridad | `POST /balances/cierres/{cierreId}/rectificaciones` | P0 | PROP |
| `CU-BAL-08` | Consultar comparación original y conciliado | RRHH | `GET /balances/cierres/{cierreId}/conciliacion` | P0 | PROP |
| `CU-BAL-09` | Consultar asistencia, faltas, cubiertas y sin cubrir | Coordinación | `GET /balances/indicadores` | P0 | PROP |
| `CU-BAL-10` | Consultar matriz mensual por servicio, día y turno | Jefatura | `GET /balances/matriz-mensual` | P0 | PROP |
| `CU-BAL-11` | Consultar cambios internos/convenios/suplencias | Supervisor | `GET /balances/movimientos-resumen` | P0 | PROP |
| `CU-BAL-12` | Consultar reporte de incidencias pendientes de validar | Jefatura | `GET /balances/pendientes` | P0 | PROP |
| `CU-BAL-13` | Descargar balance PDF con versión/huella | Supervisor | `GET /balances/cierres/{cierreId}/pdf` | P0 | PROP |
| `CU-BAL-14` | Descargar balance CSV/XLSX autorizado | RRHH | `GET /balances/cierres/{cierreId}/exportacion` | P1 | PROP |
| `CU-BAL-15` | Consultar evidencia de correcciones posteriores al corte | Auditor | `GET /balances/cierres/{cierreId}/correcciones-posteriores` | P0 | PROP |
| `CU-BAL-16` | Comparar reporte de turno vs HR/plantilla vigente | RRHH | `GET /balances/conciliacion-rh` | P1 | PROP |
| `CU-BAL-17` | Analizar tasa ausentismo con denominador definido | Jefatura | `GET /balances/tasas-ausentismo` | P0 | PROP |
| `CU-BAL-18` | Consultar cobertura por fuente y categoría | Coordinación | `GET /balances/fuentes-cobertura` | P0 | PROP |

### 5.13 DOC — Oficios, actas, supervisión normativa y seguimiento

**Origen/estado:** PROPUESTA: FUENTES DE PROYECTO; SIN TABLAS EN SQL V1. **Tablas:** `nuevas tablas: expedientes_administrativos, actas, folios, acta_participantes, evidencias, revisiones, notificaciones, hallazgos_calidad`.

La documentación de proyecto define actas/oficios, folio irrepetible, testigos, firma de enterado, fe de erratas, escalamiento RRHH/Jurídico, hallazgos normativos. Es extensión candidata que requiere revisión legal, privacidad, debido proceso y aprobación; no emitir sanción automatizada.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-DOC-01` | Consultar catálogo de tipos de documento administrativo | Jurídico | `GET /documentos/tipos` | P2 | FUT |
| `CU-DOC-02` | Crear borrador de oficio o acta | Supervisor | `POST /documentos/actas` | P2 | FUT |
| `CU-DOC-03` | Consultar actas dentro de jurisdicción | Autoridad | `GET /documentos/actas` | P2 | FUT |
| `CU-DOC-04` | Consultar expediente de acta y participantes | Autoridad | `GET /documentos/actas/{actaId}` | P2 | FUT |
| `CU-DOC-05` | Capturar hechos y testigos con vigencia de rol | Supervisor | `PATCH /documentos/actas/{actaId}` | P2 | FUT |
| `CU-DOC-06` | Adjuntar evidencia minimizada y cifrada | Supervisor | `POST /documentos/actas/{actaId}/evidencias` | P2 | FUT |
| `CU-DOC-07` | Enviar acta a revisión jurídica/jerárquica | Supervisor | `POST /documentos/actas/{actaId}/enviar-revision` | P2 | FUT |
| `CU-DOC-08` | Registrar observaciones y devolución | Autoridad | `POST /documentos/actas/{actaId}/revisiones` | P2 | FUT |
| `CU-DOC-09` | Emitir folio inmutable en transacción autorizada | Autoridad | `POST /documentos/actas/{actaId}/emitir` | P2 | FUT |
| `CU-DOC-10` | Generar PDF/QR de verificación del documento | Autoridad | `GET /documentos/actas/{actaId}/pdf` | P2 | FUT |
| `CU-DOC-11` | Registrar notificación y acuse de enterado | Empleado | `POST /documentos/actas/{actaId}/acuses` | P2 | FUT |
| `CU-DOC-12` | Registrar firmas de testigos sin falsificar firma | Autoridad | `POST /documentos/actas/{actaId}/firmas` | P2 | FUT |
| `CU-DOC-13` | Crear fe de erratas o cancelación enlazada | Jurídico | `POST /documentos/actas/{actaId}/correcciones` | P2 | FUT |
| `CU-DOC-14` | Escalar expediente a RRHH/Jurídico | Jefatura | `POST /documentos/actas/{actaId}/escalamientos` | P2 | FUT |
| `CU-DOC-15` | Levantar cédula de hallazgo de supervisión | Supervisor | `POST /supervision-calidad/hallazgos` | P2 | FUT |
| `CU-DOC-16` | Registrar subsanación/verificación de hallazgo | Supervisor | `POST /supervision-calidad/hallazgos/{hallazgoId}/seguimientos` | P2 | FUT |
| `CU-DOC-17` | Consultar indicadores de hallazgos no sancionatorios | Jefatura | `GET /supervision-calidad/indicadores` | P2 | FUT |

### 5.14 REP — Reportes, tableros y explotación analítica

**Origen/estado:** CONFIRMADO + PROPUESTA. **Tablas:** `cierres_balance, necesidades_cobertura, mediciones_complejidad, auditoria_general`.

Reportes operativos y administrativos con métricas definidas por turno, fecha, categoría, servicio y versión. No asumir que la fórmula histórica de Google Sheets es semánticamente correcta sin validación.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-REP-01` | Dashboard coordinación tiempo real | Coordinación | `GET /tableros/coordinacion` | P0 | PROP |
| `CU-REP-02` | Dashboard jefatura multi-división | Jefatura | `GET /tableros/jefatura` | P1 | PROP |
| `CU-REP-03` | Dashboard supervisor por división | Supervisor | `GET /tableros/supervision` | P0 | PROP |
| `CU-REP-04` | Reportar déficit por servicio/turno | Jefatura | `GET /reportes/deficits` | P0 | PROP |
| `CU-REP-05` | Reportar tiempos de cobertura y esperas | Jefatura | `GET /reportes/tiempos-cobertura` | P1 | PROP |
| `CU-REP-06` | Reportar cobertura efectiva vs asignaciones | Coordinación | `GET /reportes/cobertura-efectiva` | P0 | PROP |
| `CU-REP-07` | Reportar movimientos internos/convenios/pases | Jefatura | `GET /reportes/movimientos` | P1 | PROP |
| `CU-REP-08` | Reportar incidencias por causa/periodo | RRHH | `GET /reportes/incidencias` | P0 | PROP |
| `CU-REP-09` | Reportar vencimiento de contratos/competencias | RRHH | `GET /reportes/vencimientos` | P1 | PROP |
| `CU-REP-10` | Reportar demanda/ocupación y complejidad | Jefatura | `GET /reportes/carga-asistencial` | P1 | PROP |
| `CU-REP-11` | Exportar reporte autorizado a PDF | Jefatura | `POST /reportes/exportaciones` | P1 | PROP |
| `CU-REP-12` | Consultar estado de exportación asíncrona | Jefatura | `GET /reportes/exportaciones/{exportacionId}` | P1 | PROP |
| `CU-REP-13` | Consultar diccionario de KPIs y fórmulas vigentes | Auditor | `GET /indicadores/definiciones` | P0 | PROP |

### 5.15 MIG — Importación y conciliación desde Google Sheets/RH

**Origen/estado:** PROPUESTA. **Tablas:** `nuevas tablas: importaciones, importacion_filas, importacion_errores, mapas_fuentes, conciliaciones`.

Importar archivos de forma controlada y anonimizada en pruebas. No conectar la API a Sheets como fuente definitiva del balance. Mantener línea de procedencia, versión del archivo, hoja, RUD y transformaciones.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-MIG-01` | Registrar fuente de datos y esquema de columnas | Administrador | `POST /migraciones/fuentes` | P1 | FUT |
| `CU-MIG-02` | Subir archivo CSV/XLSX para staging | Administrador | `POST /migraciones/lotes` | P0 | FUT |
| `CU-MIG-03` | Consultar mapeo de columnas y tipos | Administrador | `GET /migraciones/lotes/{loteId}/mapeo` | P0 | FUT |
| `CU-MIG-04` | Configurar mapeo de RUD, categoría, turno, descanso | Administrador | `PUT /migraciones/lotes/{loteId}/mapeo` | P0 | FUT |
| `CU-MIG-05` | Prevalidar lotes sin persistencia final | Administrador | `POST /migraciones/lotes/{loteId}/prevalidar` | P0 | FUT |
| `CU-MIG-06` | Consultar errores y duplicados | Administrador | `GET /migraciones/lotes/{loteId}/errores` | P0 | FUT |
| `CU-MIG-07` | Simular consolidación entre plantillas RH y Coordinación | RRHH | `POST /migraciones/lotes/{loteId}/simular` | P0 | FUT |
| `CU-MIG-08` | Confirmar importación transaccional e idempotente | Administrador | `POST /migraciones/lotes/{loteId}/aplicar` | P0 | FUT |
| `CU-MIG-09` | Consultar bitácora, versión fuente y huella | Auditor | `GET /migraciones/lotes/{loteId}` | P0 | FUT |
| `CU-MIG-10` | Revertir mediante operación compensatoria | Administrador | `POST /migraciones/lotes/{loteId}/revertir` | P1 | FUT |
| `CU-MIG-11` | Exportar discrepancias de conciliación | RRHH | `GET /migraciones/lotes/{loteId}/discrepancias` | P1 | FUT |
| `CU-MIG-12` | Registrar lote histórico de balances sin adjudicar semántica | Administrador | `POST /migraciones/balances-historicos` | P1 | FUT |
| `CU-MIG-13` | Mapear códigos de motivos de ausencia heredados | RRHH | `POST /migraciones/catalogos-incidencia` | P0 | FUT |

### 5.16 NOT — Notificaciones y eventos en tiempo real

**Origen/estado:** PROPUESTA. **Tablas:** `nuevas tablas: notificaciones, suscripciones, entregas, outbox_eventos`.

Notificaciones informativas no sustituyen registros formales. WebSocket Gateway únicamente para cambios de lectura; comandos críticos siempre REST con autorización y auditoría.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-NOT-01` | Consultar notificaciones de usuario | Operador | `GET /notificaciones` | P1 | FUT |
| `CU-NOT-02` | Marcar notificación como leída | Operador | `POST /notificaciones/{notificacionId}/leer` | P1 | FUT |
| `CU-NOT-03` | Configurar preferencias de aviso | Operador | `PUT /notificaciones/preferencias` | P2 | FUT |
| `CU-NOT-04` | Registrar token push móvil con consentimiento | Móvil | `POST /notificaciones/dispositivos` | P1 | FUT |
| `CU-NOT-05` | Registrar entrega/fallo de notificación | Sistema | `POST /notificaciones/entregas` | P2 | FUT |
| `CU-NOT-06` | Obtener snapshot tras reconexión de WebSocket | Operador | `GET /eventos/snapshot` | P0 | PROP |

### 5.17 AUD — Auditoría, seguridad y cumplimiento

**Origen/estado:** CONFIRMADO + PROPUESTA. **Tablas:** `auditoria_general, eventos_asistencia, movimiento_eventos, incidencia_versiones, cierres_balance`.

Bitácoras inmutables, identidad del actor, hospital/servicio, tiempo real y efectivo. SQL V1 no impone autorización de negocio/RLS; autorización debe vivir en Guards y políticas verificadas y DB defensa adicional.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-AUD-01` | Consultar auditoría filtrada por ámbito y acción | Auditor | `GET /auditorias` | P0 | AC |
| `CU-AUD-02` | Consultar trazabilidad de registro por entidad | Auditor | `GET /auditorias/entidades/{tipo}/{id}` | P0 | PROP |
| `CU-AUD-03` | Consultar decisiones y eventos históricos | Auditor | `GET /auditorias/decisiones` | P0 | PROP |
| `CU-AUD-04` | Exportar evidencia de operación con hash | Auditor | `POST /auditorias/exportaciones` | P1 | PROP |
| `CU-AUD-05` | Reportar intento de acceso fuera de ámbito | Sistema | `POST /seguridad/incidentes` | P1 | PROP |
| `CU-AUD-06` | Ver políticas efectivas por hospital/servicio | Auditor | `GET /seguridad/politicas` | P0 | PROP |
| `CU-AUD-07` | Consultar estado de retención y bloqueo legal | Jurídico | `GET /seguridad/retencion` | P2 | FUT |
| `CU-AUD-08` | Registrar solicitud de rectificación de datos personales | RRHH | `POST /privacidad/solicitudes` | P2 | FUT |

### 5.18 OPS — Salud técnica, sincronización y administración operativa

**Origen/estado:** PROPUESTA. **Tablas:** `sin tabla obligatoria; almacenamiento de outbox/inbox, idempotency_records y trabajos de exportación`.

Operabilidad de servicios, sin exponer información interna. Health no requiere permisos de negocio pero se restringe internamente.

| CU-ID | Caso de uso / operación | Actor | Método y ruta (`/api/v1`) | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-OPS-01` | Health básico de API | Infra | `GET /health/live` | P0 | PROP |
| `CU-OPS-02` | Readiness PostgreSQL y colas | Infra | `GET /health/ready` | P0 | PROP |
| `CU-OPS-03` | Consultar versión de contrato API | Desarrollador | `GET /meta/version` | P0 | PROP |
| `CU-OPS-04` | Sincronizar lotes de comandos offline con idempotencia | Móvil | `POST /sync/lotes` | P0 | PROP |
| `CU-OPS-05` | Obtener cambios autorizados desde cursor | Móvil | `GET /sync/cambios` | P0 | PROP |
| `CU-OPS-06` | Consultar resultado de operación por clave idempotencia | Móvil | `GET /operaciones/{operacionId}` | P0 | PROP |
| `CU-OPS-07` | Consultar catálogos incrementales para móvil | Móvil | `GET /sync/catalogos` | P0 | PROP |
| `CU-OPS-08` | Consultar resumen de lag de sincronización | Infra | `GET /ops/sync-metricas` | P1 | PROP |


## 6. Fichas detalladas de los flujos críticos (Given/When/Then + errores)

### FC-01 · Capturar pase de lista móvil con desconexión

- **Actores:** jefe de servicio o encargado con facultad activa; supervisor valida.
- **Precondiciones:** cuenta autenticada antes de desconexión; ámbito y turno publicados; `programacion_laboral` disponible; hash/versión de catálogo cacheados.
- **Flujo:** (1) `GET /pases-lista?hospitalId&servicioId&fecha&turno` devuelve jornada y estado `PENDIENTE`; (2) operador marca asistencias/incidencias locales y se registran comandos con `clientEventId`; (3) la app Room persiste outbox local cifrado; (4) WorkManager reintenta `POST /sync/lotes` con `Idempotency-Key`; (5) el backend valida JWT renovado, alcance, contrato y versión; (6) inserta evento inmutable, actualiza estado operativo consolidado, responde `aplicado`/`duplicado`/`conflicto`; (7) supervisor valida/libera; (8) gateway WebSocket informa versión de balance.
- **Alternos:** sin WiFi → pendiente local, **no afirmar que se sincronizó**; segundo dispositivo capturó diferente estado → `409 ASISTENCIA_VERSION_CONFLICT` y resolución explícita; usuario pierde facultad durante offline → sincronización denegada o derivada a revisión; trabajador no programado → solicitud de jornada extraordinaria, no inventar asistencia.
- **Criterio CA-ASI-001:** ninguna entrada offline se duplica ni se pierde en reintentos de prueba; una captura no validada no se transforma automáticamente en falta.
- **Pruebas:** `PR-ASI-001` caída de red; `PR-ASI-002` reintento del lote; `PR-ASI-003` conflicto entre dispositivos; `PR-SEG-003` revocación de ámbito.

### FC-02 · Ausencia → necesidad → eventual → incorporación → cobertura

- **Actores:** jefe de servicio, supervisor, Coordinación, receptor del servicio.
- **Precondiciones:** jornada programada, datos de dotación y categoría; eventual con contrato compatible y presencia en Coordinación verificada, si se usa reserva.
- **Flujo:** (1) asistencia validada `AUSENTE`; (2) incidencia operativa capturada con causa aún pendiente; (3) servicio calcula necesidad por intervalo y perfil, **no por cada ausencia ciegamente**; (4) supervisor valida déficit; (5) Coordinación consulta candidatos elegibles por competencia y conflictos; (6) ejecuta asignación atómica; (7) servicio certifica incorporación real; (8) se aplica la incorporación a una necesidad durante intervalo comprobado; (9) se calcula remanente y semáforo; (10) se emite cierre.
- **Alternos:** incidencia no causa déficit → necesidad 0; eventual presente solo en Coordinación → aún no cubierta; eventual no llega al servicio → se libera asignación/alerta; necesidad 2 y solo 1 incorporación → PARCIAL; cambio de servicio → restar cobertura al origen si corresponde; solape de dos asignaciones → una se rechaza.
- **Criterio CA-COB-001:** `cubiertas + sin_cubrir = requeridas` por **intervalos homogéneos** y perfil sin doble conteo, con cálculo explícito y evidencia de incorporación.
- **Pruebas:** `PR-COB-001..006`; concurrencia en `PR-CON-002`.

### FC-03 · Convenio de sustitución no recíproco

- **Actores:** titular, sustituto, autoridad delegada y jefe receptor.
- **Flujo:** solicitar `CONVENIO_SUSTITUCION` → validar jornada/hospital/contrato/competencias/solapes → aceptación sustituto → decisión autorizada → aplicar en **una transacción** que vincule programación original, programación sustituta y efectos → registrar asistencia del sustituto → balance registra convenio sin doble cobertura.
- **Invariantes:** no compromete un turno futuro de devolución; trabajador original queda eximido solo en intervalo efectivo autorizado; si sustituto falta no se falsifica asistencia del original; historial no desaparece al revocar.
- **Criterio CA-MOV-001:** no hay doble conteo ni compromiso recíproco ficticio.

### FC-04 · Cambio de descanso ocasional y cambio permanente

- **Ocasional:** solicitud con jornada origen y nuevo horario; simular disponibilidad del empleado y dotación del servicio; aprobar; aplicar cancelación/sustitución original + creación nueva jornada atómicamente, manteniendo patrón base.
- **Permanente:** cerrar vigencia `empleado_patrones` y abrir otra desde fecha autorizada, generando programación futura y manteniendo histórico.
- **Alternos:** nueva fecha es festivo; nueva jornada se solapa; rotación mensual subárea; guardia nocturna pasa a siguiente día; descanso cruzado DL.
- **Criterio CA-CAL-001:** los días y horas programados se corresponden con el patrón vigente más excepciones aprobadas, y no hay faltas falsas.

### FC-05 · Pase de salida sin hora de regreso documentada

- **Flujo:** solicitar/autorización → salida real opcionalmente capturada → si hay regreso, registrar hora real; si no, cierre con estado `CERRADO_SIN_DATO` o `CIERRE_SIN_REGRESO` **solo según evidencia**, sin llenar `regreso_real` artificialmente → evaluar posible déficit en franja, con grado de certeza indicado.
- **Estados:** `NO_INICIADO`, `SALIDA_REGISTRADA`, `REGRESO_CONFIRMADO`, `CIERRE_SIN_REGRESO`, `CERRADO_SIN_DATO`, `NO_UTILIZADO`.
- **Criterio CA-MOV-002:** salida autorizada no equivale a salida ejecutada y no hay horas de regreso inventadas.

### FC-06 · Festivo que coincide con descanso habitual de eventual

- Se obtiene patrón vigente de contrato eventual; si la fecha era descanso y se aprueba programación extra por festivo, se usa su **turno habitual**, salvo autorización explícita de otro horario válido.
- No convertir el descanso habitual en nueva pauta semanal ni inferir compensación automática.
- **Criterio CA-CAL-002:** la guardia eventual se genera en horario correcto, sin modificar días de descanso futuros.

### FC-07 · Guardia nocturna fija con cruce de medianoche

- Tres guardias por semana, sin rotación automática. `inicio_programado` y `fin_programado` deben representarse como instantes (`timestamptz`) incluso al cruzar fecha.
- Los alias de patrones MJD/DMJ que compartan días se preservan administrativamente; no se deduce ausencia en fecha no programada.
- **Criterio CA-CAL-003:** calendario semanal y mensual respeta patrón histórico, turnos cruzados y ausencia de solape; reporte atribuye guardia al día de inicio con regla formal documentada.

### FC-08 · Reclasificación retroactiva y cierre del balance

- Día 1: ausencia registrada; eventual incorporado; cierre emitido con snapshot `EMITIDO`.
- Día 3: RRHH autoriza licencia aplicable desde Día 1; se agrega `incidencia_versiones` con `fecha_registro` de Día 3 y vigencia efectiva de Día 1; se actualiza clasificación administrativa actual; nunca se muta `cierres_balance` emitido ni `eventos_asistencia`.
- Consulta ofrece **vista original a fecha de cierre** y **vista administrativa actual conciliada**; rectificación mediante nueva versión documental, no `UPDATE` sobre cierre inmutable.
- **Criterio CA-INC-001:** ambos estados son reconstruibles, con responsable y momento de decisión; cobertura real persiste.

### FC-09 · Reasignación interna por aumento de complejidad

- Jefatura registra ocupación y complejidad de manera agregada → supervisor valida una necesidad adicional con categoría, función, competencias y franja → Coordinación simula traslado y verifica que el servicio origen no quede inseguro → autoriza movimiento operativo → servicio destino confirma recepción → cobertura efectiva queda vinculada.
- Sin capacidades comprobadas, el candidato **no se asigna automáticamente**. El motor no interpreta la NOM como ratio universal inmutable; las tablas de requisitos mínimos de personal deben validarse institucionalmente.
- **Criterio CA-COB-002:** el traslado no duplica la presencia de la persona ni sobrestima cobertura en origen/destino.

### FC-10 · Balance diario, tasa de ausentismo y PDF

- Seleccionar fecha, franja y servicio → consultar plantilla objetivo vigente, jornadas exigibles, presencias validadas, ausencias operativas, permisos, convenios, traslados, asignaciones e incorporaciones → calcular déficit por intervalos → guardar snapshot operacional y administrativo con número de versión → exportar documento con versión/hash.
- **Indicadores distintos:** `jornadas_exigibles`, `personas_programadas`, `personas_presentes`, `ausencias_operativas`, `incidencias_administrativas`, `plazas_vacantes`, `necesidades_requeridas`, `unidades_de_cobertura_efectiva`, `déficit_remanente`, `redistribuciones`, `convenios`, `pases_parciales`.
- **Criterio CA-BAL-001:** no equiparar días de descanso, ausencias y vacantes; las sumas siguen ecuaciones por perfil y franja; el cierre es reproducible.

### FC-11 · Conciliación y migración de hojas de cálculo

- Guardar fuente+hospital+documento+hoja+hash+fecha de corte → staging de filas → normalizar códigos RUD, plaza B/T, categorías, días y horas → identificar duplicados y personal no encontrado → previsualizar cambios y métricas → aprobación de responsable → `UPSERT` por claves naturales/versión → conservar mapping y errores, nunca suponer que formato de un hospital sirve como catálogo de otro.
- **Criterio CA-MIG-001:** reimportar lote idéntico no duplica empleados/contratos/balances; importación anómala bloqueada con reporte, no aplicada parcialmente sin traza.

### FC-12 · Oficios y hallazgos de supervisión (futuro / sujeto a dictamen)

- El material de proyecto introduce oficio/acta circunstanciada, testigos, folios, anexos, emisión PDF, acuses, fe de erratas, escalamiento Jurídico y hallazgos normativos.
- **Antes de programarlo:** aprobar alcance; definir garantías del procedimiento administrativo y autoridad competente, retención, acceso a datos y material probatorio, representación del trabajador, cadena de custodia, mecanismos reales de firma. No adjuntar notas de expediente clínico sin fundamento jurídico y minimización. No automatizar sanción, rescisión, puntajes disciplinarios ni restricciones laborales.
- **Criterio CA-DOC-001:** ningún folio emitido se sobrescribe o reutiliza; cualquier fe de erratas referencia al original y toda resolución final corresponde a persona facultada.

## 7. Contrato transversal de API

### 7.1 Convenciones HTTP

- Prefijo único `https://<dominio-intranet>/api/v1` — HTTPS, contrato OpenAPI 3.1, JSON UTF-8.
- Los identificadores internos son UUID; RUD es identificador institucional de búsqueda pero no un secreto.
- Fechas de calendario en `YYYY-MM-DD`; eventos en ISO-8601 con offset UTC/servidor y campo `timezone` institucional cuando se muestra. No inferir zona del móvil.
- Filtros mínimos: `hospitalId`, `divisionId`, `servicioId`, `subareaId`, `turno`, `desde`, `hasta`, `estado`, `categoriaId`, `cursor`, `limit`; **la autoridad real del ámbito la impone el servidor**.
- Paginación cursor en listados grandes; ordenar de forma determinista; límites configurables; máximo protegido.
- `POST` command para transiciones `autorizar`, `aplicar`, `cerrar`, `rectificar`; no permitir `PATCH` genérico a historiales inmutables.
- `Idempotency-Key` obligatorio en operaciones que crean/aplican/confirmar/emitir, incluidas solicitudes móviles; `If-Match` con `ETag`/`version` para evitar lost updates; contexto transaccional con correlación `X-Request-Id`.
- Estándares de estado: `200` lectura/operación, `201` creación, `202` encolado (no confirmación de resultado), `204` sin cuerpo, `400` inválido, `401` no autenticado, `403` fuera de permiso/ámbito, `404` no encontrado o no visible, `409` transición/solape/versión/conflicto, `422` regla de negocio, `429` límite, `500` error interno inesperado.
- Nunca devolver datos de otros hospitales en listados, logs o errores; las exportaciones requieren mismo ámbito que la consulta.

### 7.2 Modelo JSON de error (propuesta)

```json
{
  "code": "ASIGNACION_CONFLICTO_HORARIO",
  "message": "La persona ya tiene una asignación incompatible.",
  "details": { "campo": "inicio", "intervaloConflictivo": "2026-11-08T07:00:00-06:00/2026-11-08T14:30:00-06:00" },
  "traceId": "req-cb8a1",
  "retryable": false
}
```

Códigos de dominio obligatorios: `ALCANCE_HOSPITAL_DENEGADO`, `ROL_FUERA_VIGENCIA`, `CONTRATO_NO_VIGENTE`, `PERFIL_NO_COMPATIBLE`, `PROGRAMACION_SOLAPADA`, `GUARDIA_NO_PROGRAMADA`, `ASISTENCIA_VERSION_CONFLICT`, `INCIDENCIA_ESTADO_INVALIDO`, `MOVIMIENTO_NO_AUTORIZADO`, `CONVENIO_SIN_ACEPTACION`, `PASE_REGRESO_NO_VERIFICADO`, `EVENTUAL_PRESENCIA_NO_VALIDADA`, `INCORPORACION_NO_CONFIRMADA`, `COBERTURA_EXCESIVA`, `APLICACION_INTERVALO_INVALIDO`, `CIERRE_HISTORICO_INMUTABLE`, `IDEMPOTENCY_KEY_REUSED_DIFFERENT_PAYLOAD`.

### 7.3 Ejemplo de solicitud de asignación y respuesta

```http
POST /api/v1/asignaciones-operativas
Authorization: Bearer <token>
Idempotency-Key: 6f32a80b-6435-4ca3-bf2d-82b7cbbd7cd7
If-Match: "necesidad:7"
Content-Type: application/json

{
  "hospitalId": "<uuid>",
  "necesidadId": "<uuid>",
  "empleadoId": "<uuid>",
  "contratoId": "<uuid>",
  "servicioId": "<uuid>",
  "subareaId": null,
  "inicio": "2026-11-08T07:00:00-06:00",
  "fin": "2026-11-08T14:30:00-06:00",
  "origen": "RESERVA",
  "motivo": "Deficit validado"
}
```

```json
{
  "asignacionId": "<uuid>",
  "estado": "PROPUESTA",
  "incorporacionConfirmada": false,
  "coberturaEfectiva": false,
  "version": 1
}
```

El campo `necesidadId` de este comando se orquesta en la capa de aplicación: **la tabla `asignaciones_operativas` V1 no contiene FK directa a `necesidades_cobertura`**. La vinculación efectiva vive en `aplicaciones_cobertura` tras incorporar. Si se desea relación de reserva previa, diseñar migración V2 o tabla puente, no añadirla en DTO como si ya persistiera automáticamente.

### 7.4 Ejemplo de reclasificación administrativa retroactiva

```http
POST /api/v1/incidencias/<uuid>/reclasificaciones
Idempotency-Key: <uuid>
If-Match: "incidencia:3"

{
  "tipoIncidenciaId": "<uuid-licencia>",
  "inicioEfectivo": "2026-11-04T07:00:00-06:00",
  "finEfectivo": "2026-11-04T14:30:00-06:00",
  "motivoCambio": "Licencia autorizada posteriormente",
  "decisionAutorizacionId": "<uuid>"
}
```

Respuesta: nueva `incidencia_versiones`, estado actual administrativo, `cierreOperativoOriginalId` no modificado, diferencia visible en vista conciliada. **En V1, la creación automática de versión todavía requiere servicio de aplicación.**

### 7.5 Sincronización móvil segura (Room/WorkManager)

1. Caché de vistas de ámbito encriptado, versión de política y expiración de permisos; borrar o bloquear datos ante cierre sesión/cambio de servicio.
2. Cada acción local asigna UUID estable (`clientEventId`), `expectedVersion`, UTC local y captura humana de quién ejecutó; no confiar únicamente en reloj del teléfono.
3. Cola local ordenada por causalidad (`asistencia capturada` antes de `validación`), con reintentos exponenciales, deduplicación por actor+dispositivo+idempotencia; limitación de tamaño.
4. Respuestas del batch elemento por elemento: `APLICADO`, `YA_APLICADO`, `REQUIERE_REVISION`, `CONFLICTO`, `DENEGADO`; nunca `200 OK` genérico si hay rechazos parciales.
5. Las decisiones de autorización y cobertura definitivas **no se ejecutan offline**; requieren validación del servidor y consistencia transaccional.
6. KPIs académicos mencionados en fuentes: sincronización de 30 registros en `<5s` tras reconexión, captura de pase de lista `<2min`, actualización visible `<3s`, asignación de eventual `<10min`, PDF `<5s`. **Son metas documentales en revisión**, no rendimientos logrados ni acuerdos institucionales probados.

## 8. Eventos del dominio, WebSocket y consistencia

| Evento | Lo emite | Consumidores / consecuencia | Payload de notificación sugerido |
|---|---|---|---|
| `programacion.publicada` | Programación | móvil, balance | `hospitalId`, `servicioId`, `periodo`, `version` |
| `asistencia.capturada` | Asistencia | supervisión, conciliación | `programacionId`, `version` |
| `asistencia.validada` | Asistencia | necesidades, balance | `servicioId`, `turno`, `version` |
| `incidencia.registrada` | Incidencias | previsión, balance | `incidenciaId`, `version` |
| `incidencia.reclasificada` | Incidencias | RRHH, vista conciliada | `incidenciaId`, `version` |
| `movimiento.autorizado` | Movimientos | programación, avisos | `movimientoId`, `version` |
| `convenio.aplicado` | Movimientos | programación, balance | `movimientoId`, `version` |
| `pase.salida-registrada` | Movimientos | evaluación de déficit | `movimientoId`, `version` |
| `necesidad.validada` | Cobertura | coordinación | `necesidadId`, `version` |
| `eventual.presencia-validada` | Eventuales | reserva | `disponibilidadId`, `version` |
| `asignacion.confirmada` | Cobertura | receptores | `asignacionId`, `version` |
| `incorporacion.confirmada` | Cobertura | balance, aplicación de cobertura | `incorporacionId`, `version` |
| `cobertura.aplicada` | Cobertura | déficit remanente | `necesidadId`, `version` |
| `balance.emitido` | Balance | jefatura, RRHH | `cierreId`, `version` |

**Sala WebSocket:** `hospital:<uuid>:division:<uuid>` / `hospital:<uuid>:servicio:<uuid>` derivadas de claims **y comprobadas en servidor**; jamás confiar en `joinRoom` arbitrario. No transmitir RUD, salud, datos de paciente, narrativas de incidentes ni PDFs en eventos; hacer `GET` autenticado con alcance. Usar **outbox transaccional** para que evento se publique solo si la transacción de negocio confirma; consumidores idempotentes. El dashboard reconstruye snapshot tras reconexión.

## 9. Concurrencia, transacciones y estrategia de consistencia

| Riesgo | Estrategia de aplicación/BD | Prueba requerida |
|---|---|---|
| Dos programas superpuestos del mismo empleado | restricción `EXCLUDE` PostgreSQL ya existente; transacción + conflicto 409 | 2 sesiones con commit simultáneo |
| Dos coordinadores asignan el mismo eventual a distintos servicios | bloqueo por empleado/intervalo o exclusión adicional en `asignaciones_operativas`, verificación al confirmar; reintento con estado/version | `PR-CON-002` dos asignaciones simultáneas |
| Dos incorporaciones satisfacen la misma necesidad por encima de cantidad | `SELECT ... FOR UPDATE` sobre necesidad, cálculo de cobertura por segmentos y cantidad con bloqueo | `PR-CON-003` sobrecobertura |
| Simultánea autorización y revocación de un movimiento | versión optimista + estado y decisiones atómicas; `If-Match` | `PR-CON-004` carrera autorización-revocación |
| Duplicación de una petición móvil | `Idempotency-Key` persistida y hash de payload, respuesta estable | `PR-CON-005` 100 reintentos |
| Dos rectificaciones sobre cierre emitido | jamás `UPDATE cierres_balance` con trigger inmutable; nueva versión `UNIQUE(servicio,inicio,fin,version)` y transacción para siguiente versión | `PR-CON-006` carrera versiones |
| Cambios en catálogo/perfil entre propuesta y aplicación | volver a validar perfil, vigencia contractual, ámbitos y necesidad en el **momento del commit** | `PR-COB-005` cambio de competencia |
| Transferencia genera hueco en servicio origen | simular y validar ambos servicios en la misma operación, registrar movimiento doble y alertas | `PR-COB-006` redistribución |

**Aclaración sobre resultados previos:** la prueba 02 ya verificó rechazo de solapes de **programación laboral**, pero eso NO prueba automáticamente exclusión de doble **asignación operativa**: `asignaciones_operativas` V1 carece de una exclusión equivalente. La auditoría 04 preparada no implica que roles de negocio estén aplicados como usuarios PostgreSQL o RLS.

## 10. Catálogo de pruebas de aceptación cruzadas

| Prueba | Dado / Cuándo | Entonces esperado | Prioridad |
|---|---|---|---|
| `PR-SEG-001` | usuario hospital A solicita servicio B | `403/404`, sin fuga de datos | P0 |
| `PR-SEG-002` | encargado sin facultad de autorización aprueba convenio | rechazo y evento de auditoría | P0 |
| `PR-SEG-003` | permiso revocado durante offline | sincronización posterior denegada/revisión | P0 |
| `PR-SEG-004` | rol de jefatura expiró antes de llamada | acción denegada | P0 |
| `PR-CAL-001` | descanso SD cambia una semana a lunes | excepción únicamente fechas autorizadas, patrón intacto | P0 |
| `PR-CAL-002` | eventual descansa en festivo y trabaja | turno habitual, sin cambio permanente | P0 |
| `PR-CAL-003` | guardias LMiV durante 4 semanas | 3 por semana, sin rotación | P0 |
| `PR-CAL-004` | alias DMJ y MJD | igual días, códigos preservados | P0 |
| `PR-CAL-005` | guardia 20:00 a 07:30 | fecha final siguiente día, sin intervalo invertido | P0 |
| `PR-ASI-001` | móvil desconectado captura lista | eventos locales, 0 pérdida, estados pendientes | P0 |
| `PR-ASI-002` | mismo lote se reintenta | no duplica eventos de servidor | P0 |
| `PR-ASI-003` | dos capturas distintas sobre misma versión | 409/revisión, nunca sobreescritura silenciosa | P0 |
| `PR-ASI-004` | la hoja heredada no tiene "A" | PENDIENTE hasta verificación, no falta automática | P0 |
| `PR-INC-001` | licencia retroactiva tras cierre | cambia versión administrativa, no historia operativa | P0 |
| `PR-INC-002` | falta sin documento al capturar | se permite estado preliminar; aprobación según catálogo | P0 |
| `PR-INC-003` | plaza vacante sin empleado | no se cuenta como inasistencia personal | P0 |
| `PR-MOV-001` | convenio A→B autorizado | A eximido, B programado, sin reciprocidad | P0 |
| `PR-MOV-002` | convenio con sustituto no aceptó | no se aplica | P0 |
| `PR-MOV-003` | pase sin regreso conocido | regreso_real NULL y estado no verificado | P0 |
| `PR-MOV-004` | pase solo autorizado, nunca ejecutado | no se reduce disponibilidad como hecho | P0 |
| `PR-COB-001` | eventual confirmado, sin incorporación | cobertura efectiva = 0 | P0 |
| `PR-COB-002` | necesidad 2, incorporación 1 | cobertura PARCIAL y remanente 1 | P0 |
| `PR-COB-003` | persona sin competencia vigente | no elegible para perfil requerido | P0 |
| `PR-COB-004` | falta sin déficit por plantilla | no crea necesidad automáticamente | P0 |
| `PR-COB-005` | competencia vence entre oferta y asignación | revalidar y rechazar | P0 |
| `PR-COB-006` | transferencia A→B | cobertura destino y origen recalculadas | P0 |
| `PR-CON-001` | dos jornadas mismo empleado se solapan | exclusión DB impide duplicidad | P0 |
| `PR-CON-002` | dos coordinadores asignan eventual al mismo tiempo | solo una confirmación incompatible | P0 |
| `PR-CON-003` | necesidad cubierta recibe dos coberturas simultáneas | cantidad no excedida | P0 |
| `PR-CON-004` | autorización y revocación simultáneas | transición única coherente | P0 |
| `PR-CON-005` | 100 reintentos idempotentes | una sola mutación efectiva | P1 |
| `PR-CON-006` | dos rectificaciones cierre | versiones sin colisión | P1 |
| `PR-BAL-001` | cierre emitido y licencia posterior | snapshot histórico idéntico y conciliación diferenciada | P0 |
| `PR-BAL-002` | subáreas A y B mismas plantilla servicio | no se suma plantilla dos veces | P0 |
| `PR-MIG-001` | dos cargas idénticas RH | empleados y contratos sin duplicar | P0 |
| `PR-MIG-002` | plantilla de otro hospital sin mapping | bloqueada antes de aplicar | P0 |
| `PR-NOT-001` | WS pierde conexión y vuelve | snapshot consistente de nuevas versiones | P1 |
| `PR-DOC-001` | corrección de acta emitida | fe de erratas nueva, sin borrar original (si se aprueba módulo) | P2 |

### 10.1 Ejecución automatizada sugerida

- **Unitarias (Jest):** cálculo patrón/resto por fecha, autorización por alcance, estado de movimientos, volumen de cobertura en intervalos, filtros de competencia.
- **Integración (Testcontainers PostgreSQL 17):** migraciones reales del SQL, FK/EXCLUDE/triggers, casos de uso con transacciones, rollback, estado actual y eventos; evitar SQLite para pruebas de constraints PostgreSQL.
- **Contrato (OpenAPI/Prism/Schemathesis o equivalente):** DTOs, estatus, scopes, idempotencia, backward compatibility.
- **E2E web/móvil:** tablet sin red, jefe de servicio, coordinación con drag-and-drop, supervisor y RRHH; accesibilidad y escenarios de cambio de turno.
- **Concurrencia:** dos procesos/sesiones separados con commits y barreras, no un solo hilo; probar asignaciones y cierres, no solo programación.
- **Seguridad:** roles por hospital y servicio, IDOR, archivos, logs, JWT expirado/revocado, límites de exportación, inyección, privilegio mínimo.
- **Rendimiento:** presupuestos SRS solo como objetivos a validar en hardware real; tamaño del lote offline, conexión intranet y carga máxima documentados.
- **Datos:** ficticios o anonimizados; no usar RUD, nombres, expedientes de pacientes o fotografías de documentos reales en repositorio/CI.

## 11. Fases de implementación priorizadas

### Fase 0 · Línea base y riesgos (bloqueante)

1. Importar **el SQL maestro existente** como migración base controlada; capturar checksum; no ejecutar también `sigeh_movimientos_laborales_v1_8.sql`.
2. Conservar evidencia de pruebas 01/02 y **ejecutar/reparar 03, 04, 05** en `sigeh_qa` (no en producción).
3. Aprobar catálogo de permisos por acciones, vigencias y hospitales; decidir mecanismo de identidad (IdP hospitalario u otro), retención y custodia de archivos.
4. Revisar brechas de SQL V1: rangos cruzados hospital/contrato/servicio en algunas entidades, autoría en el momento de autorización, eventos automáticos, sobrecobertura, dobles asignaciones, outbox, read models.
5. Definir OpenAPI inicial y ADR de arquitectura; establecer CI con `migrate → test DB → test API → audit`.

### Fase 1 · MVP operativo acordado (P0)

- `ORG + PER + IAM + CAL + DOT`: padrón, roles efectivos, contratos y programación.
- `ASI`: pase de lista Android offline y validación; no falta automática por falta de "A".
- `INC + MOV`: incidencias y convenios/cambios/pases, con historia.
- `EVE + COB`: disponibilidad, reserva, preasignación, recepción real, aplicación de cobertura.
- `BAL`: balance en vivo, cierre versionado, exportación PDF.
- `OPS`: monitoreo y control de migraciones.

### Fase 2 · Consolidación administrativa y analítica (P1)

- Importadores con staging y conciliación RH/Coordinación, matriz mensual, enlace de turno con indicadores de ocupación/complejidad agregados, KPI validados, reportes e integración por eventos; avisos a personal.
- Seguridad reforzada con RLS si procede y revisión de operaciones interhospitalarias explícitas.

### Fase 3 · Extensiones condicionadas (P2)

- Módulo documental disciplinario, hallazgos normativos, productividad específica, acuses y firma, retención legal: **requiere nuevas tablas y revisión formal de alcance/jurídica/clínica**. No incorporarlo implícitamente al MVP ni automatizar juicios profesionales.

## 12. Backlog técnico inicial (historias de implementación)

| Ítem | Trabajo | Casos implicados | Criterio de salida |
|---|---|---|---|
| `TECH-001` | ADR arquitectura modular/gateways | transversal | separación de módulos y contratos aprobada |
| `TECH-002` | Migraciones incrementales V1→V2 + semillas versionadas | todos | reproducible desde base vacía |
| `TECH-003` | Token/session + Guards/PolicyEngine | IAM y todos | `PR-SEG-001..004` OK |
| `TECH-004` | App móvil Room + sync/idempotencia | ASI, OPS | `PR-ASI-001..004` OK |
| `TECH-005` | Motor calendario/turnos/festivos | CAL, DOT | `PR-CAL-001..005` OK |
| `TECH-006` | Flujo de incidencia con versiones automáticas | INC | `PR-INC-001..003` OK |
| `TECH-007` | Orquestador movimientos + autorización | MOV | `PR-MOV-001..004` OK |
| `TECH-008` | Reserva/preasignación eventual | EVE | disponibilidad ≠ incorporación |
| `TECH-009` | Motor déficit/competencias/cobertura | COB | `PR-COB-001..006` OK |
| `TECH-010` | Concurrencia en asignaciones y cierres | COB, BAL | `PR-CON-001..006` OK |
| `TECH-011` | Read model balance + PDF versionado | BAL, REP | `PR-BAL-001..002` OK |
| `TECH-012` | Importación/conciliación con staging | MIG | `PR-MIG-001..002` OK |
| `TECH-013` | WS Gateway + outbox + reconexión | NOT | `PR-NOT-001` OK |
| `TECH-014` | Alcance normativo/documental aprobado o pospuesto | DOC | dictamen de alcance; migración futura |

### 12.1 Orden de historias para el primer sprint desarrollable

1. Crear `apps/api` NestJS con `ConfigModule`, `Pg/Prisma o TypeORM` (elegir uno tras prueba del esquema real), DTOs, Swagger `/api/docs`, JWT/IdP y log estructurado; pipeline CI.
2. Implementar **Org + Personal + contrato vigente + `PolicyGuard`** (solo lectura y alta restringida).
3. `GET /pases-lista` por ámbito + día y `PUT /programaciones/{id}/asistencia` con evento inmutable; prueba de no doble captura.
4. `GET /balances/diarios` lectura derivada (sin emisión aún) y versionado/ETag.
5. SDK web Angular y cliente Kotlin generados desde OpenAPI para evitar DTOs incongruentes.

## 13. Decisiones abiertas / riesgos de análisis antes del diseño físico V2

| ID | Pendiente real | Impacto | Propuesta de resolución |
|---|---|---|---|
| `DEC-001` | A qué hospital pertenecen las fuentes y las plantillas utilizadas | fuga/mezcla interhospitalaria | `hospitalId` explícito por fuente y ámbito de usuario |
| `DEC-002` | Facultades exactas jefe/encargado/supervisor/coordinación y tiempos | autorización inválida | matriz firmada por jefatura/administración |
| `DEC-003` | Semántica de “A”, “F”, “C”, cambio interno, vacante, “sin cubre” de BP | KPIs incompatibles | homologación de códigos + pruebas con turno ficticio |
| `DEC-004` | Denominador de tasas históricas de ausentismo por turno | porcentajes engañosos | diccionario KPI versionado, validación por RRHH |
| `DEC-005` | Registros de presencia eventual en Coordinación y su autor | cobertura ficticia | verificación de recepción por actor y hora |
| `DEC-006` | Requisitos mínimos y excepciones de competencias para cada servicio | seguridad asistencial | matriz clínica aprobada, sin ratios NOM inventados |
| `DEC-007` | Descanso mínimo, horas extra y guardia nocturna especial | sobreprogramación | validación jurídico-laboral e historial |
| `DEC-008` | Días y horarios fuera de catálogos semilla; ejemplo nocturno individual diferente | omisión de jornadas reales | catálogos configurables por vigencia/contrato |
| `DEC-009` | Periodos sin guardia: no programado vs descanso legal | faltas falsas | definición administrativa por patrón, sin asumir ausencia |
| `DEC-010` | Aprobación del módulo de oficios/actas y datos probatorios | legal/privacidad | alcance y dictamen jurídico; excluir del MVP hasta entonces |
| `DEC-011` | Alcance de hoja de enlace/productividad | expansión masiva | comenzar por indicadores agregados ya definidos |
| `DEC-012` | Identidad/SSO, certificados, alcance y controles offline | acceso impropio | ADR técnico+privacidad con TI hospitalaria |
| `DEC-013` | Reglas de compensación o pago de festivos, convenios | relación laboral | **no automatizar nómina ni pagos privados** |
| `DEC-014` | Fuente de hospital/servicio en documentación de proyecto | trazabilidad | conciliar acta, ERS y fuentes del balance |

## 14. Matriz de correspondencia con requisitos académicos SIGE-H

| Requisito de P2-I03/P2-I04 | Funcionalidad de este documento | CA/Pruebas | Estado de relación |
|---|---|---|---|
| `RF-001` Captura pase de lista Android | `ASI`, `OPS`, `IAM` | CA-ASI-001, PR-ASI-001..004 | trazado, implementación pendiente |
| `RF-002` Asignación visual de eventual | `COB`, `EVE`, `REP` | CA-COB-001, PR-CON-002 | trazado, implementación pendiente |
| `RF-003` Previsión de ausencias | `CAL`, `INC`, `EVE` | PR-CAL-002, PR-INC-001 | trazado, requiere especificar política |
| `RF-004` Semáforo de cobertura | `ASI_CLIN`, `COB`, `REP` | PR-COB-002..006 | trazado, matriz normativa no validada |
| `RF-005` Reportes PDF | `BAL`, `REP` | CA-BAL-001, PR-BAL-001 | trazado, implementación pendiente |
| `RNF-001` Captura/sync offline | `ASI`, `OPS` | CA-ASI-001, PR-ASI-001..003 | trazado, rendimiento por medir |
| `RNF-002` Auditabilidad | `AUD`, `INC`, `MOV`, `BAL` | PR-INC-001, PR-MOV-001, PR-BAL-001 | parcialmente protegida por triggers DB |
| `ACE-001` Pase lista en menos de 2 min | `ASI` UX | ensayo con flujo simulado | meta documental, no observada |
| `ACE-002` Sync en menos de 5 s | `OPS` | lote 30 eventos y reconexión | meta documental, no observada |
| `ACE-003` Eventual asignado en menos de 10 min | `EVE + COB` | pruebas cronometradas de proceso | meta documental, no observada |
| `ACE-004` PDF en menos de 5 s | `BAL` | medición ambiente real | meta documental, no observada |

## 15. Definición de listo y de terminado

**Definition of Ready (DoR) por caso de uso:** actor y ámbito definidos, pre/postcondiciones, reglas y permisos, columnas SQL/versión requeridas, errores, fuente, estado del requisito, aceptación Given/When/Then, prueba y dueño de módulo.

**Definition of Done (DoD) por endpoint:** autorización de ámbito y vigencia, validación DTO, casos positivos/negativos/limites, trazabilidad de auditoría, transacción/idempotencia si aplica, concurrencia, OpenAPI actualizado, tests CI, secretos fuera de logs, métricas mínimas, revisión de migración, ambiente `sigeh_qa`, prueba manual web/móvil con datos ficticios y registro de resultado.

**No confundir**: tener 51 tablas y 8/8 pruebas estructurales/transaccionales exitosas con tener aplicaciones, autenticación, autorización hospitalaria, APIs, WebSocket, flujos integrados ni escenarios clínicos certificados.

---

**Control documental:** Documento de análisis generado a partir de conversaciones, DDL V1 local y referencias de Drive consultadas el 7-11-2026. Los enlaces se proporcionan como trazabilidad de fuente, no transfieren su contenido sensible. Esta versión está lista para revisión funcional y desglose a historias técnicas/OpenAPI; no es una línea base aprobada por autoridades hospitalarias.
