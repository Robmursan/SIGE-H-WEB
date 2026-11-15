# D1 — CU-IAM-01..06, implementación local sin aplicar SQL

Fuentes: DDL V1 externo inmutable, especificación CU-IAM-01..06, ADR-B1, informes C2.2/C2.3 y propuestas V2 existentes. D1 autoriza el conjunto de autenticación y sesiones; no altas masivas ni administración de roles. Estado: código/pruebas locales; despliegue D2/D3 pendiente.

Contratos: POST /api/v1/auth/login, POST /auth/refresh, GET /auth/me, POST /auth/logout, GET /auth/sessions, DELETE /auth/sessions/:sessionId bajo prefijo /api/v1. Identidad local por credencial Argon2id; JWT HS256 corto y refresco opaco rotatorio. Denegación genérica de credenciales, rate limit persistente, sesión/usuario activos comprobados en cada petición. Propiedad de sesiones obligatoria.

Rotación: bloquear familia/sesión, releer token tras lock, consumir anterior antes de insertar reemplazo; replay revoca familia y confirma auditoría antes de responder 401. No reintentar COMMIT incierto. Tablas y grants preparados en V2 canónica, no aplicar propuestas anteriores además de ella.

V1 no codifica titular/encargado: contexto nuevo obligatorio, mandato temporal y subconjunto explícito de permisos para encargados; sin contexto se deniega. Nunca inferir facultades por nombre de rol o ausencia de titular. Las organizaciones reales se contrastan con padres activos y vigencias.

IAM_V2_ENABLED=false por defecto: guardia 503 antes de acceder a PostgreSQL. D2 requiere migración/privilegios revisados, política institucional, secreto/issuer/audience externos, alta de credenciales/contextos autorizada y pruebas reales en entorno aprobado. Esta ficha no los autoriza.
