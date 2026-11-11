# Extractos originales de guía v1.0

Copia literal de §7 y §16; fuente y SHA-256 en INVENTARIO_FUENTES.md. Son instrucciones históricas: la dirección actual suspende orquestador/Antigravity y autoriza lotes. No constituyen autorización para migrar.

## 7. Método exacto para desarrollar CADA caso de uso

No asignar a un agente "implementa el módulo completo" sin acotar. Tomar **un CU o una vertical pequeña** de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y elaborar un expediente antes del código. Archivo: `docs/casos-uso/<CU-ID>.md`.

### Plantilla obligatoria por CU

```md
# CU-ASI-XX — Nombre concreto
Estado: AC / PROP / FUT / BLOQUEADO_POR_DECISION
Prioridad: P0 / P1 / P2
Actor principal / actores secundarios: ...
Hospital, división, servicio y subárea afectados: ...
Fuentes: [fuente concreta y sección/tab], RF/RNF, regla RN
Objetivo / disparador / valor de negocio: ...
Precondiciones (sesión, rol, contrato, programación, ámbito): ...
Entrada validada y formato: ...
Flujo feliz numerado: ...
Alternativas: sin red, ausente, parcial, sustitución, festivo, permiso expirado, duplicado
Errores con códigos HTTP: 400/401/403/404/409/422
Postcondición + evento histórico + transacción: ...
Tablas y columnas REALES de SQL V1: ...
Brecha V2 si falta tabla/columna: ...
Endpoint método + path + Swagger operationId: ...
Request/Response con JSON ficticio: ...
Idempotencia / concurrencia / versión: ...
Pantalla Angular: ruta, formulario, loading, empty, conflict, success, forbidden
Pantalla Android: navigation route, ViewModel, cache, outbox, UI offline
Eventos WebSocket / rooms / carga sin PII: ...
Given/When/Then: al menos feliz, error de alcance, duplicado, estado, concurrencia
Evidencia: test unit, e2e, curl, Swagger JSON, screenshots ficticios
Decisión humana pendiente: ...
```

### Microciclo de desarrollo por CU

1. Leer especificación y SQL y **localizar** tablas/estados, no adivinarlos.
2. Crear ficha CU + pruebas de aceptación antes de editar DDL.
3. Diseñar DTO request/query/response y `operationId` estable; usar status correctos.
4. Implementar policy + model + use case + repo parametrizado + transacción (si muta).
5. Publicar controller y decorar Swagger; probar `curl` sin token, fuera de ámbito, válido y duplicado.
6. Desarrollar Angular/Android en la capa que corresponda. **Nunca simular un endpoint real con mocks silenciosos.**
7. Si hay actualización en vivo, evento posterior al commit + refresh REST.
8. Prueba unitaria, de integración, concurrencia y aceptación de pantalla; revisar logs sin PII.
9. Registrar `CU → ruta → código → tablas → test → evidencia` en la matriz.
10. Hacer commit pequeño con ID CU y nota de decisiones, sin cambiar casos no asignados.

### Ejemplo completo: CU-PER-01 Alta de empleado

- Fuente: V1 `sigeh.empleados(empleado_id,rud,nombres,primer_apellido,segundo_apellido,activo,creado_en)`.
- Permiso: RRHH autorizado con ámbito aplicable; **el empleado es global pero alta por RRHH requiere definición de contexto organizacional**, validar si hospital debe consignarse en contrato concomitante (dos pasos o comando compuesto).
- Endpoint: `POST /api/v1/empleados`; request `{ "rud":"QA-0001", "nombres":"Ejemplo", "primerApellido":"Prueba" }`; respuesta `201 {"empleadoId":"<uuid>","rud":"QA-0001","activo":true}`.
- Si RUD duplicado → SQL `23505` -> `409 RUD_DUPLICADO`, no error 500.
- Si sin token → 401; rol no facultado → 403; campo extra `isAdmin` → 400 por whitelist.
- Swagger: `@ApiOperation({operationId:'crearEmpleado'})` + DTO `@IsString`, `@IsNotEmpty`, `@MaxLength`; `@ApiResponse` 201/400/401/403/409.
- Angular: `personal/empleados/nuevo`, búsqueda previa opcional por RUD, formulario con validación accesible, success con enlace a expediente, conflicto 409 que no borra entrada.
- Android: no es captura operativa móvil, solo lectura de directorio acotado si se aprueba; **no duplicar pantalla alta**.
- Prueba: `GET` de lectura después de POST, duplicado, límites, DB transaction rollback en QA.

### Prompt por cada CU — copiar, completar y pegar

> Implementa **solo** `CU-___` del archivo de especificación. Antes de escribir código genera `docs/casos-uso/CU-___.md` con actor, permisos, estados, tablas exactas, contrato Swagger, UI Angular/Android, alternativas y 5 pruebas Given/When/Then. Lee DDL real y declara toda brecha que requiera migración. Entrega un plan de archivos y luego implementa el slice vertical Nest `DTO → controller → use case → dominio → postgres repo → auditoría/evento`, con tests. Si no hay autoridad o estructura SQL para una operación, deja backlog explícito; no falsifiques lógica en memoria. Al terminar: build + tests + `curl`/Swagger, relación trazable CU/ruta y lista de archivos cambiados. No tocar otros CU.

## 16. Prompts de orquestación para agentes de terminal (copiar/pegar)

### Prompt maestro — lectura y reglas del repositorio

> Trabajas sobre SIGE-H, ya existe un proyecto NestJS y una BD PostgreSQL Docker con esquema `sigeh` y 51 tablas. Fuentes: `SIGE-H_BASE_DATOS_MAESTRA_V1.sql`, `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md`, este manual y `AGENTS.md`. **No reimportes SQL maestro, no ejecutes `nest new`, no borres volúmenes ni elimines datos.** Antes de modificar, inspecciona carpeta, scripts, stack, runner y DDL. Trabaja en una sola historia CU por tanda. Contratos REST documentados en Swagger, DTOs validados, scope hospitalario y permisos, repositorios SQL parametrizados, transacciones y auditoría. Si falta modelo/permiso/decisión, especifica brecha y no inventes implementación. Cada entrega debe incluir: (1) objetivo y CU, (2) archivos modificados, (3) comandos ejecutados y resultados reales, (4) rutas Swagger y ejemplos ficticios, (5) tests/fallos, (6) pendientes y siguiente CU sugerido. Evita datos reales, secretos y tokens en logs o salida.

### Prompt de planificación de una historia (sin escribir código)

> Planifica CU `[ID]` leyendo DDL y especificación. Entrega ficha en `docs/casos-uso/`, matriz actor/permiso/ámbito, diagrama textual de secuencia, contrato OpenAPI propuesto, DTOs, SQL exacto, transacciones/locks, alternos y pruebas 401/403/409/422. Identifica pantalla Angular y móvil si aplica, estados de UX, WebSocket si necesario y V2 si falta estructura. **No edites código en esta pasada.**

### Prompt de backend (después de aprobar plan)

> Implementa CU `[ID]` según ficha revisada, solo archivos del módulo dueño. Controller REST liviano, DTOs Swagger, use case, policy, repository port y adapter PG, transacción y errores de dominio. Usa esquema `sigeh`, parámetros SQL, ámbito autenticado; no usar `postgres` superusuario, no `synchronize`. Agrega unit, integración DB y e2e de éxito, 401, 403, 409/422 y concurrencia si aplica. Corre build/tests y muestra evidencias reales y diff antes de finalizar.

### Prompt de frontend web

> Consume endpoints REALES de CU `[ID]` desde Angular. Prioriza estado autenticado, selector de ámbito, loading/empty/403/409/offline, validaciones accesibles y aviso de cambios en tiempo real. No repetir política de negocios en componente; servidor recalcula. Implementa unit e2e UI, registra evidencia en `docs/pruebas` y rutas en matriz.

### Prompt de frontend Android

> Implementa CU `[ID]` de campo usando Compose + ViewModel y cliente OpenAPI. Solo acciones preliminares offline permitidas: persiste `clientEventId` con Room y retransmite con WorkManager; conflictos y denegados visibles. Confirmaciones definitivas solo online. Agrega unit Room/ViewModel e instrumentación con reconexión y token revocado. Documenta estados locales sin prometer que están aplicados en servidor.

### Prompt de revisión de seguridad y regresión

> Revisa PR del CU `[ID]` como auditor independiente. Busca SQL no parametrizado, autoridad derivada del body, accesos cross-hospital, relaciones interservicio, inmutabilidad rota, eventos antes de COMMIT, duplicate assignment, ausencia falseada, logs con PII, datos sin control en Swagger y cache offline permanente. Ejecuta pruebas reales; reporta defectos con severidad/ruta/test reproducible. No declares aprobado nada que no haya pasado automatización y revisión humana cuando proceda.

### Prompt de implementación de migración V2

> Identifica brecha `[BRECHA]` en CU `[ID]` comparando esquema V1 y contrato funcional. Propón SQL incremental `db/migrations/V2__...sql` con restricciones, índices, backfill, safe rollout y test que falla antes/pasa después. Ejecuta SOLO en base QA clonada/efímera tras aprobación, nunca en producción ni en `sigeh` sin autorización. Incluye cambios al repositorio y pruebas de rollback cuando sea posible.
