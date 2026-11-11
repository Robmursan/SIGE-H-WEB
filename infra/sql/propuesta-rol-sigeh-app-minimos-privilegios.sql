-- =============================================================================
-- SIGE-H — PROPUESTA REVISABLE DE ROL POSTGRESQL DE MÍNIMOS PRIVILEGIOS
-- Archivo: infra/sql/propuesta-rol-sigeh-app-minimos-privilegios.sql
-- Estado: PROPUESTA PARA REVISIÓN HUMANA (NO EJECUTADO AUTOMÁTICAMENTE)
-- Reglas aplicadas:
--   1. Sin SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ni BYPASSRLS.
--   2. Sin contraseñas almacenadas en texto plano ni en control de versiones
--      (la credencial se asigna fuera de banda mediante \password sigeh_app o Vault).
--   3. Sin GRANT ALL ni GRANT ... ON ALL TABLES IN SCHEMA sigeh.
--   4. Permisos explícitos tabla por tabla y operación por operación (51 tablas),
--      protegiendo las tablas históricas/inmutables como append-only (SELECT, INSERT).
-- =============================================================================

BEGIN;

-- 1. Creación del rol sin privilegios elevados y sin contraseña embebida
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sigeh_app') THEN
    CREATE ROLE sigeh_app WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

-- Revocar permisos públicos heredados y fijar search_path seguro
REVOKE ALL ON DATABASE sigeh_db FROM sigeh_app;
REVOKE ALL ON SCHEMA public FROM sigeh_app;
REVOKE ALL ON SCHEMA sigeh FROM sigeh_app;

GRANT CONNECT ON DATABASE sigeh_db TO sigeh_app;
GRANT USAGE ON SCHEMA sigeh TO sigeh_app;
ALTER ROLE sigeh_app IN DATABASE sigeh_db SET search_path = sigeh, public;

-- =============================================================================
-- GRUPO A: Tablas históricas y de bitácora inmutable (13 tablas)
-- Operación permitida: únicamente SELECT, INSERT (PROHIBIDO UPDATE, DELETE, TRUNCATE)
-- =============================================================================
GRANT SELECT, INSERT ON TABLE
  sigeh.auditoria_general,
  sigeh.cierres_balance,
  sigeh.eventos_asistencia,
  sigeh.incidencia_versiones,
  sigeh.incidencia_autorizaciones,
  sigeh.incidencia_documentos,
  sigeh.movimiento_decisiones,
  sigeh.movimiento_eventos,
  sigeh.efectos_programacion_movimiento,
  sigeh.incorporaciones_servicio,
  sigeh.aplicaciones_cobertura,
  sigeh.movimientos_operativos,
  sigeh.mediciones_complejidad
TO sigeh_app;

-- =============================================================================
-- GRUPO B: Catálogos base y RBAC estructural (9 tablas)
-- Operación permitida: SELECT, INSERT, UPDATE (bajas lógicas; sin DELETE físico)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON TABLE
  sigeh.roles,
  sigeh.permisos,
  sigeh.rol_permisos,
  sigeh.categorias,
  sigeh.funciones,
  sigeh.competencias,
  sigeh.horarios,
  sigeh.patrones_laborales,
  sigeh.tipos_incidencia
TO sigeh_app;

-- =============================================================================
-- GRUPO C: Organización hospitalaria, padrón, contratos y vigencias (13 tablas)
-- Operación permitida: SELECT, INSERT, UPDATE (inactivación/cierre de vigencia, sin DELETE)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON TABLE
  sigeh.hospitales,
  sigeh.divisiones,
  sigeh.servicios,
  sigeh.subareas,
  sigeh.usuarios,
  sigeh.usuario_roles,
  sigeh.empleados,
  sigeh.contratos,
  sigeh.adscripciones,
  sigeh.empleado_funciones,
  sigeh.empleado_competencias,
  sigeh.empleado_patrones,
  sigeh.indicadores_complejidad
TO sigeh_app;

-- =============================================================================
-- GRUPO D: Programación, asistencia, incidencias, movimientos y cobertura (16 tablas)
-- Operación permitida: SELECT, INSERT, UPDATE (transiciones de estado, sin DELETE físico)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON TABLE
  sigeh.plantilla_servicio,
  sigeh.rotaciones_subarea,
  sigeh.patron_dias,
  sigeh.calendario_festivos,
  sigeh.programacion_laboral,
  sigeh.registros_asistencia,
  sigeh.incidencias,
  sigeh.incidencia_jornadas,
  sigeh.movimientos_laborales,
  sigeh.convenios_sustitucion,
  sigeh.cambios_descanso,
  sigeh.pases_salida,
  sigeh.disponibilidad_eventual,
  sigeh.necesidades_cobertura,
  sigeh.necesidad_competencias,
  sigeh.asignaciones_operativas
TO sigeh_app;

COMMIT;
