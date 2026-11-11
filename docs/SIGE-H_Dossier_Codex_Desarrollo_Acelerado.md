# SIGE-H — Expediente de desarrollo acelerado dirigido con Codex

Fecha de consolidación: 2026-11-11. **Naturaleza:** hoja de ruta y catálogo de fuentes. No sustituye las fuentes originales ni certifica el repositorio local del usuario.

## 1. Objetivo
Concentrar temporalmente la implementación y revisión técnica en Codex CLI, utilizando ciclos verticales de casos de uso reales: requisitos → SQL/contratos → implementación backend → pruebas → Swagger → integración web/móvil cuando corresponda → revisión de seguridad → commit. Optimizar tiempo total evitando infraestructura auxiliar que no desbloquee funcionalidades, sin omitir controles que protejan integridad hospitalaria.

## 2. Fuentes prioritarias en el entorno local (reportadas por los agentes)
1. `AGENTS.md` en la raíz y `apps/api/AGENTS.md`: instrucciones del repositorio y gobernanza.
2. `SIGE-H_GUIA_PASO_A_PASO_DESARROLLO_CON_AGENTES_v1_0.md`: guía rectora. Apartados conocidos: §1 inventario, §2 repositorio, §3 Docker/PG, §4 NestJS/Swagger, §5 módulos, §6 identidad/ámbitos, §7 microciclo por CU, §8 API/Swagger, §9 módulos (IAM §9.1), §10 Angular, §11 Android, §12 eventos/concurrencia/idempotencia, §13 brechas SQL, §14 pruebas/CI, §15 roadmap, §16 prompts, §17 inventario de 271 CU, §18 decisiones.
3. `docs/casos-uso/SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md`: catálogo de CU y endpoints; comprobar existencia en worktree.
4. `SIGE-H_BASE_DATOS_MAESTRA_V1.sql`, anteriormente localizado por agentes bajo un directorio externo `SIGE-H-API/infra/docker/`: SQL V1 autoritativo; comprobar ruta y hash antes de uso.
5. `infra/sql/propuesta-rol-sigeh-app-minimos-privilegios.sql`: **propuesta**, no permisos autorizados/aplicados.
6. `.sigeh/`, `scripts/sigeh-orchestrator.py`, `docs/agentes/`: prototipo de orquestador; **no operativo para invocaciones reales**, no dejar que impida avanzar en CU independientes con Codex.
7. `docs/diagnostico-inicial.md`, informes de auditoría anteriores y estado Git: evidencia histórica, no prueba automática del HEAD actual.

## 3. Documentos de Google Drive identificados (URLs verificadas por búsqueda)
- SRS de SIGE-H: https://docs.google.com/document/d/1Cij4uCNaMbJqXlMefdvlhpelzCNZFTDSxiDGDClFaLI/edit
- Propuesta de proyecto: https://docs.google.com/document/d/1KkMiAtxk2R6KZqYpiMgTlWfHw8-en4PT6WatZqGCj5A/edit
- Documento ERS P2-I03: https://docs.google.com/document/d/1SHDrxu1wuy6M6eF8wnOjoD7qIOCSekpbGB9a31DigWU/edit
- Alcance y criterios de aceptación P2-I04: https://docs.google.com/document/d/1atJrbViPSFovtZE_wKVs76MusbQjjjnb2J-AVwEpuUA/edit
- Calidad y pruebas P2-I09: https://docs.google.com/document/d/1X4bu2XltVEkIIHbTjI2nZOP0QcEAMeGQS3BQeRr8fTM/edit
- Trazabilidad P2-I05: https://docs.google.com/spreadsheets/d/1q_gpQzdGJ2H22ZOi9si2_ieB5KeuPRGzGPajdQXb6WI/edit
- Riesgos P2-I10: https://docs.google.com/spreadsheets/d/1VISkfqP1cU7rFXibVySLEkQWjgOCytI3K1Ga6VZbU_4/edit
- EDT P2-I06: https://docs.google.com/spreadsheets/d/1SPumnqhpC2c9EW-tnSL9_rgmIG5qpnVPzOaVT_j2CEk/edit
- Cronograma P2-I08: https://docs.google.com/spreadsheets/d/1s5YxHQeVEGk7WY5leDTksOihe75s0jKBEWvz446kUYw/edit
- Git workflow: https://docs.google.com/document/d/161AUBogT42gON39lp3okO7PvrKVfEWzQssg4M-UrT1I/edit
- Análisis de procesos de Coordinación de Enfermería: https://drive.google.com/file/d/1JTCbB5A8Z14EQTz_0CIOxFQ2f25li9GB/view

**Nota:** metadatos y partes de algunos documentos fueron consultados; no se ha demostrado conciliación exhaustiva de todas sus versiones ni aprobación institucional. El plan P2-I09 consultado registra estado EN REVISIÓN y línea base NO APROBADA. Marcar decisiones abiertas.

## 4. Arquitectura y dominio conocidos
- Backend: NestJS REST modular, PostgreSQL preexistente, SQL parametrizado mediante `pg.Pool`/`PostgresService`, Swagger/OpenAPI. Angular web y Android offline-first son destinos de producto.
- Dominio: administración y supervisión de personal de enfermería, estructura orgánica, programación/dotación, asistencia/incidencias, movimientos, cobertura y reemplazos, balances, reportes, auditoría.
- SQL V1: 51 tablas base según los agentes; **no regenerar** ni introducir columnas supuestas.
- Control de acceso: usuarios, roles, permisos, rol_permisos, usuario_roles con vigencia y ámbitos hospital/división/servicio. La tabla `sigeh.usuarios` reportada tiene `usuario_id`, `empleado_id`, `identificador`, `activo`; no tiene `password_hash`, `username`, `email` ni `hospital_id`.
- IAM oficial: CU-IAM-01 POST /auth/login, 02 POST /auth/refresh, 03 POST /auth/logout, 04 GET /auth/me (verificar prefijos `/api/v1` y catálogo antes de escribir).
- Riesgos centrales: aislamiento multihospital, permisos efectivos y vigencias, seguridad JWT, privilegios de BD, transacciones inciertas, concurrencia, trazabilidad histórica, idempotencia móvil offline, privacidad y aprobación institucional de funciones sensibles.

## 5. Estado Git reportado, NO verificado independientemente en esta sesión
- Sprint 0: `7a877cd`.
- Hardening Sprint 0.1: `3d884cb`.
- Correcciones Sprint 0.2: `78c67cb` reportado como base de ramas del orquestador; deben verificarse el contenido y ascendencia.
- Planificador dry-run: `1f14458`.
- Diseño Nivel 1: `54653dd`, rama `feat/orchestrator-level1-design` en worktree `/home/robreport/Documents/SIGE-H-sprint-0.1`.
- El repositorio principal `/home/robreport/Documents/SIGE-H` tenía archivos IAM sin registrar y no debe limpiarse ni sobrescribirse.
- Última revisión de Codex del orquestador dictaminó **NO APTO para piloto de ejecución real** por permisos de filesystem/Git, logs sin sanitizar, descendientes de procesos, recuperación y contratos de auditoría. No bloquear con ese proyecto auxiliar las entregas normales de Codex sobre código del producto en worktrees aislados.

## 6. Priorización de entregas verticales
**Bloque 0 (imprescindible, corto):** inventario de ramas/commits, ubicación de todas las fuentes, inspección efectiva de dependencias, CI y QA aislada, selección de base estable, diferencias entre guía y código; cerrar hallazgos críticos/altos de infraestructura que afecten el próximo bloque. No borrar archivos de otros agentes.

**Bloque 1 (identidad, habilitador):** decisión institucional entre IdP y credenciales locales, ficha CU-IAM-01..04, propuesta V2 si realmente necesaria, menor privilegio SQL, implementación de login/refresh/logout/me según aprobación y pruebas reales de ámbito/revocación/rate limiting.

**Bloque 2 (catálogos operativos):** ORG, PER y estructura de hospitales, divisiones, servicios y personal, consultas y autorización ámbito; UI Angular mínima usable.

**Bloque 3 (núcleo operable):** CAL/DOT, ASI, INC, MOV, EVE, COB, BAL según dependencias reales; end-to-end de cobertura y balance de turno incluyendo cruces de medianoche, bloqueo/concurrencia e historial.

**Bloque 4 (observabilidad y cierre):** REP, NOT/AUD y trazabilidad, integración clínica autorizada, MVP web consolidado y flujos Android offline con idempotencia/reconciliación. MIG/ASI_CLIN/DOC según autorizaciones y fases de la guía.

Las anteriores son propuestas de empaquetado, **no sustituyen** el orden, prioridad ni aceptación oficiales de cada CU.

## 7. Contrato de trabajo para Codex: velocidad con calidad
- Un solo agente Codex en escritura. Separar `git worktree` y rama por bloque; jamás manipular archivos IAM no comiteados en repositorio principal.
- Ejecutar primero inventario y mapa de dependencias; después trabajar con lotes cohesivos de CU que compartan tablas/seguridad para evitar costos de coordinación.
- Para cada lote: ficha por CU/alcance, código, DTO, política de autorización, queries, tests unitarios + integración + E2E pertinentes, OpenAPI, mínimos UI si el flujo lo exige, evidencia y commits pequeños.
- Prohibidas migraciones/GRANT/REVOKE reales, cambios a 51 tablas, login local supuesto, credenciales reales, push/merge/despliegue sin aprobación humana específica.
- QA separada de cualquier BD institucional; guardas verificables antes de tests con escritura.
- Gate de entrega: sin críticos o altos relevantes, pruebas exigibles aprobadas, contratos/SQL concordantes, riesgo residual documentado, commit y árbol limpio. Medios/bajos no bloqueantes se convierten en deuda técnica con responsable y fecha o dependencia.
- No automatizar reintentos de escrituras ante COMMIT incierto sin claves de idempotencia y reconciliación.
- Seguridad: denegar por defecto, no confiar exclusivamente en JWT para ámbitos, comprobar roles y vigencias efectivos y pertenencia del recurso persistido.
- No fingir integración de Angular/Android si no existe código usable; documentar componentes implementados y pendientes.

## 8. Primer entregable concreto solicitado a Codex
Crear, dentro de un worktree seguro y en una rama de planificación, `docs/ejecucion/INVENTARIO_FUENTES.md`, `docs/ejecucion/ESTADO_REAL_REPOSITORIO.md`, `docs/ejecucion/MATRIZ_CU_DEPENDENCIAS.md`, `docs/ejecucion/ROADMAP_BLOQUES.md` y `docs/ejecucion/DECISIONES_PENDIENTES.md`; comprobar diferencias con guía y SQL, proponer el primer bloque funcional viable y ejecutar únicamente pruebas no destructivas. Luego implementar el primer bloque que no dependa de cambios SQL ni aprobaciones pendientes, si la evidencia lo permite; si no, cerrar con propuesta exacta para autorización. No empezar a codificar IAM como si su modelo SQL contuviera credenciales.

## 9. Decisiones que siguen abiertas
- Esquema de identidad: IdP institucional vs credenciales locales.
- Migración V2 de credenciales/sesiones; cambios SQL y rol operativo `sigeh_app`.
- Identidad de la BD QA y límites de acceso efectivos.
- Integración de ramas anteriores en una base estable para desarrollo.
- Validaciones y autorizaciones institucionales de funciones jurídico-administrativas.

Este expediente se construyó con información de reportes proporcionados por el usuario, consultas de metadatos y fragmentos de documentos en Google Drive. Codex debe hacer lectura local de cada fuente para obtener el contenido completo antes de tomar decisiones técnicas.
