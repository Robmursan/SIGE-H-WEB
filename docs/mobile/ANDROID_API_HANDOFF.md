# SIGE-H — Contrato API para Android

## Estado y contrato canónico

- Base path: `/api/v1/`.
- OpenAPI backend: [`artifacts/openapi/sigeh-v1.json`](../../artifacts/openapi/sigeh-v1.json).
- SHA-256: `a6fbe4804d6ecc7eb88ea78254b4b80bd1f1ad0a4bde6eba70a08358a78dba86`.
- Validación observada: 49 operaciones, 42 paths, referencias resueltas; `npm --prefix apps/api run openapi:check` PASS.
- Las rutas de IAM y asistencia existen, pero tienen gates por defecto apagados. No asumir disponibilidad por aparecer en OpenAPI.
- Pruebas PostgreSQL previas corresponden a entornos efímeros anteriores. El run E2E-MVP-09 quedó sin completar por falta de publicación de puerto; este handoff no acredita integración Android ni prueba real del run retenido.

## URL base

Emulador Android local:

```text
http://10.0.2.2:3000/api/v1/
```

Dispositivo USB conectado al host mediante reverse:

```bash
adb reverse tcp:3000 tcp:3000
```

```text
http://127.0.0.1:3000/api/v1/
```

Estas direcciones solo funcionan mientras exista una API QA autorizada activa en el host y accesible en `127.0.0.1:3000`. No habilitar escucha LAN ni firewall para esta integración. El HTTP claro se limita a debug/local; cualquier distribución fuera de loopback requiere TLS y configuración institucional aprobada.

## Autenticación, contexto y sesión

Todas las operaciones protegidas usan:

```http
Authorization: Bearer <accessToken>
```

No enviar el bearer en query/body ni registrarlo. Mantener el access token en memoria si la arquitectura de la app lo permite; guardar el refresh token solo en almacenamiento cifrado respaldado por Android Keystore. Borrar ambos al logout. No incluir credenciales/tokens en analytics, crash reports, HAR o capturas.

`POST /auth/login` requiere `IAM_V2_ENABLED=true` en el proceso QA. Request verificado contra `LoginDto`:

```json
{
  "identificador": "<cuenta-sintetica>",
  "password": "<secreto-sintetico-no-versionado>"
}
```

La cuenta de ejemplo es un placeholder, no un usuario real. `identificador` es string de 1–100 caracteres; `password`, string no vacío de máximo 1024. Respuesta `200 TokensDto`:

```json
{
  "accessToken": "<no-registrar>",
  "refreshToken": "<no-registrar-en-claro-en-logs>",
  "tokenType": "Bearer",
  "expiresIn": 300,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`POST /auth/refresh` no requiere bearer en el contrato actual; request:

```json
{ "refreshToken": "<valor-opaco-redactado>" }
```

El marcador está redactado y no satisface la longitud del DTO; en runtime se envía exclusivamente el refresh opaco recibido durante login, desde almacenamiento seguro. No copiar valores de credencial a documentación. La renovación real devuelve el mismo `TokensDto` con tokens rotados. Es de un solo uso: serializar las renovaciones del cliente (single-flight); no disparar dos refresh simultáneos. Un replay puede revocar la familia. Tras 401 en una llamada protegida, intentar como máximo una renovación coordinada; si falla, limpiar sesión y volver a login.

`POST /auth/logout` requiere bearer, no tiene body y responde `204`. Tras logout, descartar tokens localmente incluso si el cliente pierde la respuesta; no reintentar usando una sesión descartada sin volver a autenticar.

`GET /auth/me` requiere bearer y responde `ProfileDto`: `usuarioId`, `sessionId`, `provider` y asignaciones explícitas con `kind`, `scope` y `permissions`. No inferir autorización por nombre de rol, cargo o contexto seleccionado.

`GET /auth/me/contextos` requiere bearer y no necesita `CATALOGOS_ADMINISTRAR`. No admite filtros. Devuelve solo contextos propios vigentes con nombres legibles:

```json
[
  {
    "assignmentId": "550e8400-e29b-41d4-a716-446655440001",
    "hospitalId": "550e8400-e29b-41d4-a716-446655440002",
    "hospitalNombre": "Hospital Sintético A",
    "zonaHoraria": "America/Mexico_City",
    "divisionId": "550e8400-e29b-41d4-a716-446655440003",
    "divisionNombre": "División Sintética",
    "servicioId": "550e8400-e29b-41d4-a716-446655440004",
    "servicioNombre": "Servicio Sintético",
    "tipo": "TITULAR",
    "vigenteDesde": "2026-11-01T00:00:00.000Z",
    "vigenteHasta": null,
    "permisos": ["ASISTENCIA_CAPTURAR"]
  }
]
```

Los UUID y nombres son datos ficticios de ejemplo. El cliente puede presentar los contextos recibidos y conservar el seleccionado para la UI; el servidor vuelve a verificar facultad, sesión, vigencia y ámbito en cada operación.

## Pase de lista

El rol Android debe tener `ASISTENCIA_CAPTURAR` y asignación vigente limitada al hospital/servicio correspondiente. `GET /pases-lista` acepta lectura con `ASISTENCIA_CAPTURAR` o `ASISTENCIA_VALIDAR`; no existe concesión implícita. La bandera del proceso es `ASISTENCIA_ENABLED=true`, además de IAM activo. Por defecto está `false`.

`GET /pases-lista` requiere query:

| Parámetro | Requerido | Regla |
|---|---:|---|
| `hospitalId` | sí | UUID; debe coincidir con el ámbito autorizado |
| `servicioId` | sí | UUID dentro del hospital y alcance autorizado |
| `fecha` | sí | `YYYY-MM-DD`, fecha local de inicio en zona del hospital |
| `horarioId` | no | UUID |
| `cursor` | no | UUID exclusivo del último item; orden `id:asc` |
| `limit` | no | 1–100, default 50 |

Ejemplo de URL (IDs ficticios):

```text
GET /api/v1/pases-lista?hospitalId=550e8400-e29b-41d4-a716-446655440002&servicioId=550e8400-e29b-41d4-a716-446655440004&fecha=2026-11-22&limit=50
```

Respuesta `200 PaseListaPageDto` (ejemplo abreviado, campos según esquema OpenAPI):

```json
{
  "hospitalId": "550e8400-e29b-41d4-a716-446655440002",
  "servicioId": "550e8400-e29b-41d4-a716-446655440004",
  "fecha": "2026-11-22",
  "zonaHoraria": "America/Mexico_City",
  "items": [
    {
      "programacionId": "550e8400-e29b-41d4-a716-446655440010",
      "empleado": {"empleadoId": "550e8400-e29b-41d4-a716-446655440011", "nombres": "Persona Sintética", "primerApellido": "Prueba"},
      "horarioId": "550e8400-e29b-41d4-a716-446655440012",
      "turnoCodigo": "MATUTINO",
      "inicioProgramado": "2026-11-22T14:00:00.000Z",
      "finProgramado": "2026-11-22T22:00:00.000Z",
      "estadoProgramacion": "PROGRAMADA",
      "capturada": false,
      "asistenciaId": null,
      "estadoOperativo": "PENDIENTE",
      "validacionAdministrativa": null,
      "revision": "0",
      "ultimaCaptura": null,
      "capturable": true,
      "motivoNoCapturable": null
    }
  ],
  "nextCursor": null,
  "limit": 50,
  "order": "id:asc"
}
```

El endpoint muestra jornadas existentes; no crea programación. `PENDIENTE` es ausencia de captura, no ausencia laboral. Los datos mínimos de nombre siguen siendo personales: mantener `Cache-Control: no-store`, no persistir snapshots más de lo necesario y no usar el pase como fuente de asistencia administrativa o cobertura efectiva.

La paginación de cursor es estable por ID, no un cursor de cambios. Para polling, consultar desde la primera página y recorrer todas las páginas requeridas; no superponer solicitudes. Al cerrar sesión o cambiar contexto, detener el polling.

## Captura inicial

`PUT /programaciones/{programacionId}/asistencia` exige bearer, bandera `ASISTENCIA_ENABLED=true`, facultad `ASISTENCIA_CAPTURAR`, ámbito vigente, jornada elegible y ventana temporal. No acepta `hospitalId`/`servicioId` del cliente: se deriva y valida en backend.

Headers:

```http
Authorization: Bearer <accessToken>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440020
Content-Type: application/json
```

Request exacto:

```json
{"estado":"PRESENTE","expectedRevision":"0"}
```

Estados: `PRESENTE`, `AUSENTE`, `PARCIAL`. Solo primera captura (`expectedRevision: "0"`). La clave es UUID v4 estable para actor+jornada: conservarla ante timeout/reintento; no crear una nueva clave para “forzar” una captura distinta. Respuesta `200 CaptureReceiptDto`:

```json
{
  "programacionId": "550e8400-e29b-41d4-a716-446655440010",
  "asistenciaId": "550e8400-e29b-41d4-a716-446655440021",
  "eventoId": "9007199254740993",
  "estadoOperativo": "PRESENTE",
  "validacionAdministrativa": "PENDIENTE",
  "actorId": "550e8400-e29b-41d4-a716-446655440022",
  "registradoEn": "2026-11-22T14:15:00.000Z",
  "revision": "9007199254740993"
}
```

`eventoId` y `revision` son BIGINT representados como texto: no convertirlos a `Number` en Kotlin/JavaScript. Capturar asistencia no crea incidencias ni aprueba ausencias/incapacidades.

## Errores y reintentos

Los esquemas de error son `ReadHttpErrorDto` salvo límite IAM (`IamRateLimitErrorDto`). Seguir los códigos presentes en OpenAPI:

- `400`: DTO, UUID, fecha o parámetro inválido; corregir entrada.
- `401`: sesión/credencial inválida o revocada. Renovar una sola vez mediante single-flight; si falla, pedir login.
- `403`: facultad o ámbito denegado. No reintentar automáticamente ni cambiar el hospital seleccionado para probar acceso.
- `404`: recurso no disponible/no visible o sesión no disponible al logout. No inferir que está vacío.
- `409`: captura previa, clave reutilizada con payload distinto, jornada no elegible/cerrada. Refrescar el pase antes de ofrecer acciones.
- `429`: respetar backoff; no intensificar login/refresh.
- `503`: feature flag apagada, persistencia indisponible o resultado transaccional incierto. En captura reintentar solo la misma clave idempotente, luego reconciliar con un GET.
- `204`: logout exitoso, sin cuerpo.

## Estado real y dependencias

El contrato contiene las siete operaciones de sesión/pase requeridas. IAM fue ejercitado previamente contra QA efímero según `docs/iam/D2.2-validacion-funcional-QA.md`; la lectura/captura fue ejercitada en PostgreSQL efímero según `docs/sprint/CU-ASI-QA-01-validacion-efimera.md`. Es evidencia histórica, no prueba del run E2E-MVP-09 ni de Android. El código actual mantiene `IAM_V2_ENABLED=false` y `ASISTENCIA_ENABLED=false` por defecto. No hay evidencia de RLS; el aislamiento validado corresponde a predicados y autorización NestJS.

El pase requiere `programacion_laboral` ya existente y capturable. No hay en este circuito una operación organizacional HTTP para crear empleados o contratos ni CAL publicación operativa; `POST /programaciones/generar` sigue bloqueado por `CAL_PUBLICATION_ENABLED=false`, contexto/políticas institucionales y dependencias SQL. No insertar filas para aparentar publicación. Android puede avanzar con login/consulta de contextos una vez autorizada una API QA, pero la prueba de asistencia espera una programación legítima y datos sintéticos autorizados.
