# Deuda técnica y bloqueos

Responsable técnico: Codex. Corte 2026-11-11. Política de severidad: la dirección maestra vigente; no se reaudita todo el repositorio por cada lote.

| ID | Severidad | Hecho | Dependencia / acción | Estado |
|---|---|---|---|---|
| DT-01 | ALTA | Identidad y persistencia de sesiones no existen en V1 | DEC-E01; bloquea IAM/negocio, no OPS-03 | PENDIENTE_DECISION |
| DT-02 | ALTA | Destino QA/privilegios efectivos no acreditados | DEC-E02; no integración PostgreSQL ni writes; guard estático de destino no prueba privilegios | BLOQUEANTE_DB |
| DT-03 | ALTA | Código IAM ajeno no registrado supone columnas no existentes y usa secreto predeterminado | No importarlo; propietario conserva cambios; revisión dirigida al retomar IAM | AISLADO_EN_MAIN |
| DT-04 | ALTA | Docker publica 5432 en 0.0.0.0/IPv6 | Confirmar bind/firewall antes de datos sensibles; requiere acción del propietario | PENDIENTE_INFRA |
| DT-05 | MEDIA | Auditoría/scope/jerarquía de usuario_roles incompletos en V1 | Diseñar políticas persistidas y autoridad real en B1; no permisos inventados | BLOQUEA_B1 |
| DT-06 | MEDIA | Inbox/outbox/idempotencia/doble asignación no garantizados por V1 | Propuestas V2 aprobadas por separado; locks y pruebas concurrentes en B4/B5/B7 | BLOQUEA_FLUJOS_AFECTADOS |
| DT-07 | MEDIA | Documentos remotos usan reglas normativas, timestamps y actas contradictorias | DEC-E04–E09; revisión clínica/jurídica/privacidad, sin codificar presunciones | PENDIENTE |
| DT-08 | BAJA | Angular/Android aún sin implementación conectada en base | Crear clientes al desbloquear B1, no mock de negocio | BACKLOG |
| DT-09 | MEDIA | No se acredita monitoreo/Observe en AppModule actual aunque AGENTS API lo describe | Verificado código real; no añadir integración externa sin necesidad/autorización | PENDIENTE_SEGUN_CU |
| DT-10 | MEDIA | La integración SQL heredada comprueba conectividad pero no mínimo privilegio efectivo antes de tráfico operativo | Antes de habilitar BD: sonda independiente de rol efectivo, destino y grants; no ejecutar bajo superusuario | BLOQUEANTE_DB |
| DT-11 | BAJA | Worktree de desarrollo vive en /tmp y depende de node_modules preinstalado reutilizado | Commits quedan en Git común; usar npm ci con permisos de red al preparar entorno reproducible; no depender de /tmp para respaldos | DOCUMENTADO |

El orquestador/Antigravity permanecen suspendidos; sus hallazgos no se declaran resueltos ni son prerrequisito para desarrollar producto con Codex.

## Revisión focalizada B1

| ID | Severidad / estado | Evidencia y tratamiento |
|---|---|---|
| DT-B1-01 | ALTA / BLOQUEA_PUBLICACION | Adaptadores SQL y autorización preparados, sin ejecución PG real; no marcar CU implementados ni exponer controllers. Resolver con QA aprobada. |
| DT-B1-02 | ALTA / BLOQUEA_IAM | Sin proveedor/sesiones reales. Token revocado, refresh replay, logout y concurrencia de sesión son pruebas faltantes, no simuladas. |
| DT-B1-03 | MEDIA / DECISION | Lectura restringida a CATALOGOS_ADMINISTRAR hasta ratificar matriz institucional; no impide preparación interna. |
| DT-B1-04 | MEDIA / PROPUESTA | La etiqueta postgres:17-alpine de QA no está fijada por digest. Fijar digest verificado al autorizar/provisionar QA; sin iniciar imagen en esta entrega. |
| DT-B1-05 | MEDIA / PENDIENTE_QA | Preflight y contrato SQL cuentan 51 tablas físicas por pg_class, no por tablas visibles a un rol con SELECT solo en nueve. Su ejecución todavía pendiente. Tras V2 revisar baseline/umbral explícitamente. |
| DT-B1-06 | MEDIA / ALCANCE | Paginación UUID estable dentro de cada statement; sin snapshot entre páginas bajo cambios concurrentes. Versionado de snapshots si un CU futuro lo requiere. |

DT-11 de B0 mitigada: worktree/commits de B1 persistentes bajo Documents; el enlace local de node_modules reutiliza dependencias instaladas, no se incluye en commit. El futuro preflight de integración aborda DT-10, pero no se declara validado contra PostgreSQL. Las propuestas V2 no garantizan por sí solas revocación, límites de vida ni refresh seguro sin use cases/transacciones/pruebas correspondientes.
