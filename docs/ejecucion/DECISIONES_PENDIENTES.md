# Decisiones pendientes y contradicciones

Corte: 2026-11-11. Responsable técnico de seguimiento: Codex; decisiones institucionales corresponden a la persona facultada. No se simulan firmas ni aprobaciones.

| ID | Evidencia / contradicción | Decisión provisional o pregunta | Bloquea |
|---|---|---|---|
| DEC-E01 | usuarios V1 sin password_hash/username/email/hospital_id; IAM ajeno supone columnas | Elegir IdP autorizado o propuesta V2 local; no implementar login supuesto | IAM y negocio protegido |
| DEC-E02 | QA no acreditada; reporte anterior indicaba superusuario | Confirmar destino QA aislado y rol efectivo sin superusuario ni BYPASSRLS; grants/migraciones separados | Integración DB y writes |
| DEC-E03 | Propuesta remota microservicios vs guía monolito modular; TypeORM ilustrativo vs pg real | Conservar monolito modular pg ESM/Vitest actual; cambio incompatible requiere decisión | No bloquea OPS |
| DEC-E04 | SRS/formatos disciplinarios no tienen tablas V1 y catálogo los marca FUT | Excluir DOC hasta autorización jurídica/modelo V2 | DOC |
| DEC-E05 | Propuesta: checks presentes por defecto y falta por desmarcado; catálogo: PENDIENTE hasta validación | Aplicar catálogo/guía y evidencia de captura explícita; no inferir presencia/falta | Aceptación ASI |
| DEC-E06 | SRS propone timestamp-wins offline; guía exige idempotencia/versionado y revalidación | Conflictos visibles; no sobrescritura por reloj del móvil; V2 inbox pendiente | Sync |
| DEC-E07 | NOM/semáforo por categoría en SRS vs competencia verificada y no ratios universales en guía | Obtener matriz clínica institucional; no codificar reglas normativas supuestas | Elegibilidad clínica |
| DEC-E08 | Fray Antonio Alcalde vs Juan I. Menchaca en fuentes | Hospital de origen explícito, no fusionar identidades | Importación |
| DEC-E09 | SRS rutas /asistencia,/personal,: actas vs catálogo /pases-lista,/empleados | Catálogo oficial propuesto como referencia; confirmar al seleccionar CU; no publicar aliases inventados | Contratos afectados |
| DEC-E10 | Catálogo antiguo /api/docs y Jest vs guía /docs y código Vitest ESM | Conservar /docs, imports .js y Vitest conforme stack real | Resuelto técnicamente |
| DEC-E11 | Dependencias DOT→CAL→DOT; ASI_CLIN↔COB/BAL | Separar catálogos/lecturas de comandos; no tratar módulos como DAG de CU aprobado | Planificación |
| DEC-E12 | 271 CU con AC/PROP/FUT; P2-I03 EN REVISIÓN, P2-I09 NO APROBADA | Autorización de desarrollo no equivale a aprobación hospitalaria; mantener estados | Aceptación institucional |
| DEC-E13 | Docker publica 5432 en todas las interfaces; diagnóstico histórico decía loopback | Propietario revisa bind/firewall; no alterar infraestructura sin solicitud | Exposición con datos sensibles |
| DEC-E14 | CU-OPS-03 P0/PROP sin payload detallado | Contrato técnico mínimo {apiVersion,apiBasePath}, misma fuente que OpenAPI; no SHA/DB/secretos; autorizado para desarrollo en esta tanda | No bloquea OPS-03 |
| DEC-E15 | Matriz REQ/ENT/ACE/VER accesible, no conciliada exhaustivamente con 271 CU | Revisar trazas por lote; no inventar aprobaciones ni mapeo uno a uno | DoR de cada lote |

Consultas de identidad y QA presentadas a la persona usuaria; sin respuesta no se consideran autorizadas. La instrucción actual permite avanzar en OPS-03 sin BD, sin relajar los bloqueos del negocio.

## Decisiones específicas de B1

| ID | Decisión necesaria | Propuesta concreta | Gate |
|---|---|---|---|
| DEC-B1-01 | Confirmar proveedor disponible/autorizado o elegir identidad local | ADR-B1-identidad-autorizacion.md compara ambas; búsquedas OIDC/SSO/Keycloak sin evidencia de integración autorizada | Login/refresh/logout/me |
| DEC-B1-02 | Autorizar cluster QA, baseline saneada, credenciales externas y rol lectura | infra/qa/compose.qa.yaml y propuesta-rol-qa-lectura.sql, puerto 127.0.0.1:55432; nada ejecutado | Integración PG |
| DEC-B1-03 | Ratificar facultad para leer catálogos organizativos | Restricción conservadora al permiso V1 CATALOGOS_ADMINISTRAR; no siembra grants ni crea códigos | Exposición ORG |
| DEC-B1-04 | Elegir/aprobar únicamente propuestas V2 necesarias | Sesiones si API emite tokens; credenciales locales u OIDC como alternativas, no paquete automático | SQL/identidad |
| DEC-B1-05 | Revisar clientes externos del PostgreSQL compartido | Patch localhost preparado; no se puede asegurar compatibilidad LAN sin inventario del propietario | Cambio de bind/reinicio |
| DEC-B1-06 | Aprobar fixtures sintéticos QA y procedencia del baseline | fixtures-org.propuesta.sql sin empleados/credenciales; no aplicar a base institucional | Pruebas SQL de aislamiento |

No se solicita ni presupone aplicar estas propuestas durante B1. El proveedor runtime rechaza toda identidad; no hay rutas nuevas de negocio.
