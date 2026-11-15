# AGENTS.md — SIGE-H (pegar en raíz del proyecto NestJS)

## Objetivo
Construir SIGE-H caso por caso: NestJS + PostgreSQL existente en Docker + Swagger; clientes Angular/Android; multi-hospital con seguridad y trazabilidad.

## Fuentes y orden de verdad
1. `SIGE-H_BASE_DATOS_MAESTRA_V1.sql` (DDL exacto) y estructura PostgreSQL inspeccionada.
2. `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` (271 CU, estados AC/PROP/FUT).
3. `SIGE-H_GUIA_PASO_A_PASO_DESARROLLO_CON_AGENTES_v1_0.md` (microciclo y fases).
4. Documentos institucionales/Drive referenciados en esas fuentes, sin transferir PII de trabajadores.

## Reglas no negociables
- Inspecciona antes de editar. Proyecto Nest YA existe: NO ejecutes `nest new` ni regeneres layout.
- BD `sigeh` ya existe; NUNCA repetir SQL maestro, `synchronize`, `DROP`, `docker compose down -v`, ni trabajo en producción sin aprobación.
- Usa SQL parametrizado, transacciones en mismo client, prefijo `sigeh.`, rol de base sin privilegios de superusuario.
- Un CU por tanda; primero ficha `docs/casos-uso/CU-*.md`, después DTO/Swagger/usecase/policy/repo/tests y UI pertinente.
- No confundir programado, asistencia, reserva, asignación, incorporación ni cobertura efectiva.
- Convenio = sustitución sin reciprocidad; pase puede no tener regreso; guardia nocturna fija y termina día siguiente; retroclasificación no reescribe cierres.
- Separación de hospital/división/servicio y vigencia de permiso en TODOS los writes y lecturas sensibles. Denegar por defecto.
- No inventes columnas ni endpoints implementados. Si algo necesita V2, deja propuesta y tests faltantes: no simules persistencia en memoria.
- Swagger solo describe rutas reales: DTO validado, Auth, 401/403/409/422, operationId y ejemplos ficticios.
- WebSocket solo emite señal tras COMMIT, por ámbito autorizado, sin PII; cliente recupera snapshot por REST.
- Móvil offline es preliminar, con clientEventId e idempotencia; NO afirmar cobertura efectiva ni autorización offline.
- Nunca muestres RUD/identidades reales ni JWT/contraseñas en tests, logs, commits o capturas.
- Respetar ESM/CJS, Jest/Vitest y versiones del package.json actual.
- Terminar cada cambio con build/tests/evidencias REALES, lista de archivos, diff y pendientes.

## Formato obligatorio de respuesta del agente
1. CU asignado, fuentes y estado.
2. Qué inspeccionó y qué queda por decidir.
3. Archivos creados/editados (ruta exacta).
4. Rutas HTTP efectivas publicadas y URL Swagger.
5. Tests y comandos ejecutados con resultado observado.
6. Riesgos: autorización, multihospital, concurrencia, historial, offline.
7. Siguiente CU sugerido (NO implementarlo sin solicitud).

## Primer encargo cuando reciba repo nuevo
Hacer diagnóstico READ-ONLY de src/package.json/Docker/BD; documentar `docs/diagnostico-inicial.md` y proponer cambios mínimos para `GET /api/v1/health` y `/docs`. No tocar nada más hasta verificar conexión QA.
