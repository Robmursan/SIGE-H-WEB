-- =============================================================================
-- SIGE-H — PROPUESTA REVISABLE DE ROL POSTGRESQL DE MÍNIMOS PRIVILEGIOS
-- Archivo: infra/sql/propuesta-rol-sigeh-app-minimos-privilegios.sql
-- Estado: PROPUESTA PARA REVISIÓN HUMANA (NO EJECUTADO EN POSTGRESQL)
-- Alcance actual: Sprint 0 / 0.2 (únicamente CU-OPS-01 y CU-OPS-02 implementados)
--
-- Hallazgos de auditoría corregidos en esta propuesta:
--   1. Si el rol sigeh_app ya existe, se fuerzan sus atributos seguros y se
--      verifica mediante aserciones explícitas que NO posea SUPERUSER,
--      BYPASSRLS, CREATEROLE, CREATEDB, REPLICATION, INHERIT, membresías en
--      otros roles (pg_auth_members) ni sea propietario (owner) de esquemas,
--      tablas, vistas, secuencias o rutinas.
--   2. Se revocan explícitamente privilegios a nivel de tablas, secuencias y
--      rutinas tanto de sigeh_app como de PUBLIC (no se asume que REVOKE sobre
--      el esquema revoque permisos en objetos existentes).
--   3. Se eliminan por completo las concesiones generalizadas de INSERT/UPDATE
--      sobre roles, permisos, rol_permisos, usuario_roles y demás tablas de
--      dominio aún no implementadas.
--   4. El rol operativo se limita estrictamente a los permisos requeridos por
--      los casos de uso implementados actualmente (CU-OPS-01 / CU-OPS-02:
--      CONNECT en BD y USAGE en esquema sigeh, con 0 permisos DML sobre las 51
--      tablas maestras).
--   5. Incluye bloque de verificación negativa (has_table_privilege) que
--      aborta la transacción si sigeh_app conserva permisos de UPDATE, DELETE
--      o TRUNCATE sobre tablas históricas/inmutables o permisos de escritura
--      sobre tablas RBAC/dominio.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1: Crear o endurecer atributos del rol de aplicación (sin password en Git)
-- -----------------------------------------------------------------------------
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
  ELSE
    ALTER ROLE sigeh_app WITH
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

-- -----------------------------------------------------------------------------
-- PASO 2: Comprobaciones previas de seguridad (atributos, membresías y ownership)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_rol record;
  v_memberships integer;
  v_owned_objects integer;
BEGIN
  SELECT
    rolsuper,
    rolinherit,
    rolcreaterole,
    rolcreatedb,
    rolcanlogin,
    rolreplication,
    rolbypassrls
  INTO v_rol
  FROM pg_roles
  WHERE rolname = 'sigeh_app';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El rol sigeh_app no existe tras el paso de inicialización.';
  END IF;

  IF v_rol.rolsuper
     OR v_rol.rolbypassrls
     OR v_rol.rolcreaterole
     OR v_rol.rolcreatedb
     OR v_rol.rolreplication
     OR v_rol.rolinherit THEN
    RAISE EXCEPTION
      'Atributos inseguros detectados en sigeh_app (super=%, bypassrls=%, createrole=%, createdb=%, replication=%, inherit=%)',
      v_rol.rolsuper, v_rol.rolbypassrls, v_rol.rolcreaterole,
      v_rol.rolcreatedb, v_rol.rolreplication, v_rol.rolinherit;
  END IF;

  -- Rechazar membresías heredadas o concedidas a otros roles
  SELECT count(*)::int INTO v_memberships
  FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.member
  WHERE r.rolname = 'sigeh_app';

  IF v_memberships > 0 THEN
    RAISE EXCEPTION
      'El rol sigeh_app pertenece a % rol(es) adicional(es) en pg_auth_members; debe carecer de membresías.',
      v_memberships;
  END IF;

  -- Rechazar propiedad (ownership) sobre esquemas, tablas, secuencias, vistas o funciones
  SELECT (
    (SELECT count(*) FROM pg_namespace WHERE nspowner = 'sigeh_app'::regrole) +
    (SELECT count(*) FROM pg_class WHERE relowner = 'sigeh_app'::regrole) +
    (SELECT count(*) FROM pg_proc WHERE proowner = 'sigeh_app'::regrole)
  )::int INTO v_owned_objects;

  IF v_owned_objects > 0 THEN
    RAISE EXCEPTION
      'El rol sigeh_app es propietario (owner) de % objeto(s) en el catálogo; el rol de aplicación no debe ser dueño del DDL.',
      v_owned_objects;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- PASO 3: Revocación exhaustiva de privilegios directos, en objetos y vía PUBLIC
-- (REVOKE en esquema NO revoca privilegios previamente concedidos en tablas)
-- -----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON DATABASE sigeh_db FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE sigeh_db FROM sigeh_app;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM sigeh_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

REVOKE ALL PRIVILEGES ON SCHEMA sigeh FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA sigeh FROM sigeh_app;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA sigeh FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA sigeh FROM sigeh_app;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sigeh FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sigeh FROM sigeh_app;

REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA sigeh FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA sigeh FROM sigeh_app;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM sigeh_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM sigeh_app;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM sigeh_app;

-- Impedir que futuros objetos creados por sigeh_admin otorguen permisos a PUBLIC o sigeh_app por defecto
ALTER DEFAULT PRIVILEGES IN SCHEMA sigeh REVOKE ALL ON TABLES FROM PUBLIC, sigeh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA sigeh REVOKE ALL ON SEQUENCES FROM PUBLIC, sigeh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA sigeh REVOKE ALL ON ROUTINES FROM PUBLIC, sigeh_app;

-- -----------------------------------------------------------------------------
-- PASO 4: Concesión estrictamente limitada a los CU implementados actualmente
-- Casos implementados en Sprint 0 / 0.2:
--   - CU-OPS-01 (GET /api/v1/health/live): no requiere acceso a tablas.
--   - CU-OPS-02 (GET /api/v1/health/ready y GET /api/v1/health): ejecuta
--     SELECT 1 y verifica existencia del esquema 'sigeh' en information_schema.
-- Por tanto, en el estado actual NO se concede SELECT/INSERT/UPDATE/DELETE
-- sobre ninguna de las 51 tablas de negocio ni sobre roles/permisos/usuarios.
-- -----------------------------------------------------------------------------
GRANT CONNECT ON DATABASE sigeh_db TO sigeh_app;
GRANT USAGE ON SCHEMA sigeh TO sigeh_app;
ALTER ROLE sigeh_app IN DATABASE sigeh_db SET search_path = sigeh, public;

-- -----------------------------------------------------------------------------
-- PASO 5: Verificaciones negativas obligatorias (UPDATE, DELETE, TRUNCATE y RBAC)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla text;
  v_tablas_inmutables text[] := ARRAY[
    'sigeh.auditoria_general',
    'sigeh.cierres_balance',
    'sigeh.eventos_asistencia',
    'sigeh.incidencia_versiones',
    'sigeh.incidencia_autorizaciones',
    'sigeh.incidencia_documentos',
    'sigeh.movimiento_decisiones',
    'sigeh.movimiento_eventos',
    'sigeh.incidencia_jornadas',
    'sigeh.movimientos_operativos',
    'sigeh.mediciones_complejidad'
  ];
  v_tablas_rbac text[] := ARRAY[
    'sigeh.roles',
    'sigeh.permisos',
    'sigeh.rol_permisos',
    'sigeh.usuario_roles',
    'sigeh.usuarios'
  ];
BEGIN
  -- 5.1 Verificar que ninguna tabla histórica/inmutable tenga UPDATE, DELETE o TRUNCATE
  FOREACH v_tabla IN ARRAY v_tablas_inmutables LOOP
    IF has_table_privilege('sigeh_app', v_tabla, 'UPDATE')
       OR has_table_privilege('sigeh_app', v_tabla, 'DELETE')
       OR has_table_privilege('sigeh_app', v_tabla, 'TRUNCATE') THEN
      RAISE EXCEPTION
        'Violación de inmutabilidad: sigeh_app posee UPDATE, DELETE o TRUNCATE sobre %',
        v_tabla;
    END IF;
  END LOOP;

  -- 5.2 Verificar que ninguna tabla de identidad/RBAC tenga INSERT, UPDATE, DELETE o TRUNCATE
  FOREACH v_tabla IN ARRAY v_tablas_rbac LOOP
    IF has_table_privilege('sigeh_app', v_tabla, 'INSERT')
       OR has_table_privilege('sigeh_app', v_tabla, 'UPDATE')
       OR has_table_privilege('sigeh_app', v_tabla, 'DELETE')
       OR has_table_privilege('sigeh_app', v_tabla, 'TRUNCATE') THEN
      RAISE EXCEPTION
        'Violación de privilegio RBAC: sigeh_app posee permisos de escritura sobre %',
        v_tabla;
    END IF;
  END LOOP;

  -- 5.3 Verificar que en el estado actual (Sprint 0.2) sigeh_app no tenga DML sobre ninguna de las 51 tablas
  FOR v_tabla IN
    SELECT format('sigeh.%I', table_name)
    FROM information_schema.tables
    WHERE table_schema = 'sigeh' AND table_type = 'BASE TABLE'
  LOOP
    IF has_table_privilege('sigeh_app', v_tabla, 'SELECT')
       OR has_table_privilege('sigeh_app', v_tabla, 'INSERT')
       OR has_table_privilege('sigeh_app', v_tabla, 'UPDATE')
       OR has_table_privilege('sigeh_app', v_tabla, 'DELETE')
       OR has_table_privilege('sigeh_app', v_tabla, 'TRUNCATE') THEN
      RAISE EXCEPTION
        'Concesión prematura detectada: sigeh_app tiene privilegios DML sobre % sin CU implementado que lo requiera',
        v_tabla;
    END IF;
  END LOOP;
END
$$;

COMMIT;
