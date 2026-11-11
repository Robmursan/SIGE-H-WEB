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
