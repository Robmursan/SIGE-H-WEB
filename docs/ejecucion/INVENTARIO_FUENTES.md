# Inventario verificado de fuentes

Corte: 2026-11-11. Orden de verdad: DDL V1/estructura inspeccionada → catálogo CU/API → guía → fuentes institucionales conciliadas. La instrucción directa actual autoriza lotes cohesionados y sustituye la restricción previa de un CU por tanda; mantiene aprobación separada para SQL/privilegios/integraciones.

| Ruta | SHA-256 de bytes leídos | Estado |
|---|---|---|
| `AGENTS.md` | `28b212908fbcec37c891e766eb23d6cc80b839786f80eeda9920ed862b721777` | Disponible; referencia, no aprobación institucional |
| `apps/api/AGENTS.md` | `81fd150f5f8e64863e10020ee38b5c7099c151ece3b3d9cd620316fed809ba7a` | Disponible; referencia, no aprobación institucional |
| `SIGE-H_GUIA_PASO_A_PASO_DESARROLLO_CON_AGENTES_v1_0.md` | `e859428eaf5cba0f47d52d515544b85525c74be1b52a9801523254a49a2038fd` | Disponible; referencia, no aprobación institucional |
| `docs/casos-uso/SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` | `d44d12b6328c027167d401c846c3476372d6833c51fdefcd672de14cdedf3119` | Disponible; referencia, no aprobación institucional |
| `docs/SIGE-H_Dossier_Codex_Desarrollo_Acelerado.md` | `38726d30a79ccbb0e69380056c3af99aaf3b834979565820acc96e805f920b8e` | Disponible; referencia, no aprobación institucional |
| `/home/robreport/SIGE-H-API/infra/docker/SIGE-H_BASE_DATOS_MAESTRA_V1.sql` | `3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088` | Disponible; referencia, no aprobación institucional |

SQL leído como referencia completa, sin ejecutarlo. 51 CREATE TABLE; usuarios solo declara usuario_id, empleado_id, identificador y activo. No hay credenciales, sesiones, inbox ni outbox. DDL externo: su ubicación es inventariada, no una autorización para escribirlo.

## Inventario y método

§17 de la guía coincide fila por fila con §5 del catálogo: 271 IDs únicos, 18 módulos, AC=99, PROP=123, FUT=49; P0=188, P1=57, P2=26. 270 combinaciones método/ruta: CU-MOV-05 y CU-MOV-12 comparten POST /movimientos/{movimientoId}/decisiones. AC no equivale a aprobación institucional.

§7 exige ficha, columnas reales, contrato, política, repositorio/transacción pertinente, pruebas, UI cuando corresponda y evidencia; se aplica antes de código. Los siete prompts originales de §16 y el método se conservan literalmente en METODO_Y_PROMPTS_FUENTE.md, separados de decisiones actuales.

## Fuentes institucionales

Ver FUENTES_REMOTAS.md: once documentos del expediente accesibles en texto. P2-I03 y P2-I09 en revisión; no usar indicadores automáticos de matrices como aprobaciones. Pendientes: conciliación institucional, firmas y tablas de personal/balances con PII, pruebas SQL 01–05 y fuentes adicionales citadas en guía no aportadas localmente. No se consultaron filas institucionales de PostgreSQL.

## Tablas V1 inventariadas

`sigeh.hospitales`, `sigeh.divisiones`, `sigeh.servicios`, `sigeh.subareas`, `sigeh.categorias`, `sigeh.funciones`, `sigeh.competencias`, `sigeh.empleados`, `sigeh.contratos`, `sigeh.adscripciones`, `sigeh.empleado_funciones`, `sigeh.empleado_competencias`, `sigeh.usuarios`, `sigeh.roles`, `sigeh.permisos`, `sigeh.rol_permisos`, `sigeh.usuario_roles`, `sigeh.plantilla_servicio`, `sigeh.rotaciones_subarea`, `sigeh.horarios`, `sigeh.patrones_laborales`, `sigeh.patron_dias`, `sigeh.empleado_patrones`, `sigeh.calendario_festivos`, `sigeh.programacion_laboral`, `sigeh.registros_asistencia`, `sigeh.eventos_asistencia`, `sigeh.tipos_incidencia`, `sigeh.incidencias`, `sigeh.incidencia_jornadas`, `sigeh.incidencia_versiones`, `sigeh.incidencia_autorizaciones`, `sigeh.incidencia_documentos`, `sigeh.movimientos_laborales`, `sigeh.movimiento_decisiones`, `sigeh.movimiento_eventos`, `sigeh.convenios_sustitucion`, `sigeh.cambios_descanso`, `sigeh.pases_salida`, `sigeh.efectos_programacion_movimiento`, `sigeh.indicadores_complejidad`, `sigeh.mediciones_complejidad`, `sigeh.disponibilidad_eventual`, `sigeh.necesidades_cobertura`, `sigeh.necesidad_competencias`, `sigeh.asignaciones_operativas`, `sigeh.incorporaciones_servicio`, `sigeh.aplicaciones_cobertura`, `sigeh.movimientos_operativos`, `sigeh.cierres_balance`, `sigeh.auditoria_general`.
