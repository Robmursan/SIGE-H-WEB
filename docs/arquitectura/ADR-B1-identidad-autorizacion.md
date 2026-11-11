# ADR-B1 — Identidad y autorización multihospital

Estado: PROPUESTA TÉCNICA; pendiente de decisión institucional. Fecha: 2026-11-11. No aprueba proveedor, migración, rol ni endpoint. Fuentes: catálogo §5.1/§5.2, guía §6/§9.1/§13/§16, inventario B0 y DDL V1.

## Disponibilidad comprobada

No hay adaptador OIDC/SSO, issuer/JWKS/client registrado ni configuración de identidad autorizada en las fuentes locales inspeccionadas. La lectura de .env se limitó a nombres de claves, sin mostrar valores; no había claves OIDC/SSO/issuer/JWKS. Búsqueda documental conectada SIGE-H OIDC, SIGE-H SSO y Keycloak: sin resultados; SIGE-H identidad devuelve plantillas académicas, no un registro de integración autorizado. No prueba inexistencia de IdP en la institución: su disponibilidad sigue PENDIENTE. No se contactó ningún issuer ni se pidió token.

## Comparación y recomendación

| Aspecto | IdP institucional OIDC | Credenciales locales V2 |
|---|---|---|
| Estado real | No disponible/documentado/autorizado en la evidencia recibida | No disponible en SQL V1; requiere modelo y autorización nuevos |
| Ventaja | Delegar ciclo de credenciales/MFA/cuentas a TI | Independencia si no hay proveedor autorizado |
| Costo y riesgo | Acuerdo de integración, client IDs, redirect URI, claves, relación (issuer,subject)↔usuario y disponibilidad | Custodia de hashes, recuperación, MFA, rate limit, bloqueo, revocación, operación y privacidad |
| SQL | Vínculo estable de identidad externa; sesiones de API si emite tokens propios | Credenciales separadas y sesiones/refresh persistidos |
| Publicación actual | Bloqueada | Bloqueada |

Recomendación condicionada: preferir IdP institucional si TI lo confirma y autoriza; no desplegar otro IdP ni elegir local por falta de respuesta. Si no existe, aprobar explícitamente alternativa local y migraciones antes de implementar IAM-01..04. Ambos usan el mismo puerto IdentityVerifier, hoy con implementación que rechaza todo; no existe mock en runtime ni opción para habilitar sujetos desde environment/header/body.

## Contrato futuro de autenticación y sesión

OIDC: authorization code + PKCE, state/nonce, redirect URI registrada exacta; validar issuer, firma/JWKS, algoritmo permitido, audience y tiempos. No usar ID token como access token de API. El par issuer+subject vincula un usuario revisado; nunca auto-vincular por email ni por nombre. La custodia de tokens web debe considerar BFF/cookie HttpOnly/Secure/SameSite y CSRF según decisión de despliegue; Android usa almacenamiento protegido del sistema. Referencias primarias: [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html), [OAuth Security BCP RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

Si SIGE-H emite JWT propios: access token corto con sub/iss/aud/exp/jti/sid; no incluir permisos como fuente de autoridad. Persistir sesión y validar usuario activo, expiración y revocación en cada petición protegida. Refresh opaco aleatorio: solo hash persistido, rotación de un solo uso con SELECT FOR UPDATE sobre sesión/familia; consumir anterior y registrar siguiente en una transacción. Replay revoca familia completa; respuestas no revelan si existe usuario. Logout revoca sesión; comprobarla evita que un JWT firmado siga dando acceso. Logout local y logout global del IdP son distintos, sujetos a capacidades autorizadas del proveedor. No se afirma revocación implementada.

No reintentar refresh ni writes si COMMIT es incierto; conservar estado/reconciliar o exigir reautenticación. Tokens y hashes no se registran. MFA/rate limit/recuperación/retención y parámetros de hashing requieren política y pruebas antes de abrir login. Los campos de las propuestas no son columnas existentes V1.

## Autorización actual preparada sobre V1

La identidad verificada solo aporta usuario_id. AccessRepository lee cuenta, asignaciones, rol_permisos y jerarquía; assignmentAllows exige usuario/hospital/padres activos, periodo [desde,hasta), permiso explícito y coherencia hospital↔división↔servicio. observedAt procede de PostgreSQL. No se concede nada por ADMIN_SISTEMA, RRHH ni otro nombre de rol.

OrganizationQueries valida DTO/UUID y no permite actor/isAdmin desde request. Antes de obtener recursos comprueba política; el statement final vuelve a verificar usuario, grants, permiso, vigencias y padres. Esto evita confiar en un snapshot anterior o en claims JWT. No se cachean permisos. La revocación es efectiva para statements nuevos; no cancela una lectura que ya empezó. Los futuros writes necesitan autorización y locks en la misma transacción, no reutilizar este precheck como garantía de mutación.

Jerarquía: grant hospitalario puede ver descendientes; divisional solo su división; de servicio solo su servicio y subáreas. Encabezados de hospital/división son visibles para navegar su servicio; no conceden acceso a otros hijos. Las FKs simples V1 de usuario_roles se contrastan siempre con padres reales. CATALOGOS_ADMINISTRAR ya existe; se usa como restricción conservadora para estas lecturas, pendiente de matriz institucional, sin nuevas semillas ni grants.

## Propuestas separadas, sin ejecución

infra/sql/propuestas/V2__iam_sesiones.propuesta.sql: sesiones/familia refresh si la API emite tokens propios. V2__iam_credenciales_locales.propuesta.sql solo si se elige identidad local. V2__iam_identidades_oidc.propuesta.sql solo si se elige OIDC. No aplicar todas como un paquete automático; no alteran las 51 tablas V1. Primero resolver estrategia y retención, revisar constraints/índices/rollout/privilegios y aprobar QA. Sin rollback destructivo automático: para revertir código, deshabilitar funciones y preservar sesiones/auditoría según política autorizada.

## Criterio para habilitar HTTP

Proveedor real aprobado y probado; vínculo de identidad; sesiones/revocación verificables; matriz de permisos autorizada; QA aislada con rol efectivo; pruebas token inválido/expirado/revocado, refresh replay, logout, usuario inactivo, ámbitos ajenos, vigencia y carreras; OpenAPI de rutas reales y UI autenticada conectada. Hasta entonces: PREPARADO_NO_PUBLICADO y 404 real para IAM/ORG. No se consideran completos los CU.
