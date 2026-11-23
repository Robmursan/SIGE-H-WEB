# SIGE-H — Lista de verificación QA Android

Esta lista aplica únicamente en una instancia QA efímera autorizada. No usar PostgreSQL institucional, QA habitual ni QA-INT retenido. Los datos y cuentas de prueba deben ser sintéticos, con alcance hospital/servicio explícito. El backend y su contrato OpenAPI deben estar activos con SHA coincidente antes de probar la app.

## Preparación del cliente

- [ ] Descargar `artifacts/openapi/sigeh-v1.json` desde el backend y comprobar SHA-256 `a6fbe4804d6ecc7eb88ea78254b4b80bd1f1ad0a4bde6eba70a08358a78dba86`.
- [ ] Configurar base URL de debug `http://10.0.2.2:3000/api/v1/` (emulador), o ejecutar `adb reverse tcp:3000 tcp:3000` y usar `http://127.0.0.1:3000/api/v1/` (USB).
- [ ] Confirmar con el operador que la API QA escucha en loopback, no en `0.0.0.0`/LAN.
- [ ] Verificar usuario sintético Android con `ASISTENCIA_CAPTURAR` vigente y ámbito solo del servicio asignado.
- [ ] Verificar usuario B sintético en otro ámbito para casos negativos. No usar cuentas reales.
- [ ] Habilitación temporal solo en proceso QA: `IAM_V2_ENABLED=true`, `ASISTENCIA_ENABLED=true`. Todas las banderas ORG/workforce/L3A/CAL permanecen apagadas para el pase.
- [ ] Confirmar que existe una programación sintética y legítima en ventana; no fabricar una por SQL ni asumir que plantilla equivale a programación.
- [ ] No exportar `Authorization`, payloads de login/refresh ni cuerpos que contengan tokens a logs/HAR/crash reporting.

## Login, contexto y renovación

- [ ] Login correcto devuelve `200 TokensDto`; la contraseña no queda en preferencias, almacenamiento persistente ni logs.
- [ ] Credenciales incorrectas producen respuesta genérica y no revelan existencia de usuario.
- [ ] Tokens se excluyen de logs, screenshots, analytics y reportes de errores.
- [ ] `GET /auth/me` usa bearer y muestra solo identidad/contextos/permissions retornados por el API.
- [ ] `GET /auth/me/contextos` muestra nombres legibles y únicamente contextos propios vigentes.
- [ ] El cliente no inventa descendientes de una división ni infiere facultades del tipo `TITULAR`.
- [ ] En 401 se ejecuta a lo sumo una renovación single-flight; dos requests concurrentes no envían refresh duplicado.
- [ ] Refresh rota el token; replay no se reintenta y dirige a reautenticación.
- [ ] Logout responde 204, borra tokens locales y detiene polling.
- [ ] Cambiar de usuario/contexto limpia datos en memoria y detiene tareas pendientes.

## Pase de lista y aislamiento

- [ ] `GET /pases-lista` envía `hospitalId`, `servicioId`, `fecha` local, `limit` y opcionalmente cursor/horario.
- [ ] `limit` se mantiene entre 1 y 100; se procesa `nextCursor` según `id:asc`.
- [ ] Polling cada 5 s no superpone requests; vuelve al primer cursor para actualizar el snapshot y se pausa al salir, logout o cambiar contexto.
- [ ] `PENDIENTE` se presenta como “sin captura”, nunca como AUSENTE.
- [ ] La pantalla diferencia `estadoOperativo` y `validacionAdministrativa`.
- [ ] `capturable=false` y `motivoNoCapturable` deshabilitan captura; la UI no sustituye la validación backend.
- [ ] Acceso del usuario A dentro de su hospital/servicio funciona.
- [ ] A intenta leer el hospital/servicio B: resultado esperado 403 o 404 según el recurso/ruta; no se muestran datos B.
- [ ] Usuario sin `ASISTENCIA_CAPTURAR` no puede capturar (403); no se prueba con identidades institucionales.
- [ ] `Cache-Control: no-store`; no conservar el pase en almacenamiento compartido/sin cifrar.

## Captura, idempotencia y conflictos

- [ ] Enviar `PUT /programaciones/{programacionId}/asistencia` con `Authorization`, UUID v4 `Idempotency-Key` y body `{ "estado": "PRESENTE|AUSENTE|PARCIAL", "expectedRevision": "0" }`.
- [ ] La app crea una clave una vez por intención de captura y conserva la misma al reintentar tras timeout.
- [ ] Respuesta 200 actualiza el pase; `eventoId` y `revision` se tratan como decimal string/BIGINT, nunca como floating point.
- [ ] El acuse muestra `validacionAdministrativa=PENDIENTE`; no lo etiqueta como aprobado.
- [ ] Un segundo envío diferente no genera una nueva captura: ante 409 recargar el pase y mostrar el conflicto.
- [ ] Captura fuera de ventana, programación no capturable, contrato no vigente, jornada cerrada/cancelada/sustituida no cambia datos.
- [ ] Timeout/503 con resultado incierto conserva la misma clave y reconcilia mediante GET antes de permitir nueva intención.
- [ ] Ninguna ausencia/vacación/incapacidad crea automáticamente estado de asistencia.

## Códigos y comportamiento

- [ ] 400: mostrar validación accionable sin revelar detalles internos.
- [ ] 401: renovar una vez coordinadamente; si falla, limpiar sesión.
- [ ] 403: denegar; no reintentar ni cambiar silenciosamente de ámbito.
- [ ] 404: recurso no disponible/no visible, no tratar como lista vacía.
- [ ] 409: refrescar snapshot y resolver conflicto del usuario.
- [ ] 429: respetar backoff.
- [ ] 503: indicar servicio no disponible/deshabilitado; conservar clave idempotente si había una captura.

## Evidencia y cierre

- [ ] Registrar versiones app/API/contrato, hora, entorno runId y códigos HTTP, sin PII/secretos.
- [ ] Evidencias fuera del repositorio, en carpeta privada con permisos restrictivos.
- [ ] Confirmar desde otra sesión web autorizada que el GET muestra la captura persistida.
- [ ] Confirmar con el responsable que terminó el ciclo antes de cerrar el run.
- [ ] Seguir el runner de cierre por runId; no borrar fixtures o auditoría con SQL manual.
- [ ] Si ACL, trigger, journal o propiedad difieren, detener y conservar recursos.
- [ ] Marcar “Android/PostgreSQL real PASS” solo cuando exista evidencia observada en QA efímero; la suite mock/local no basta.
