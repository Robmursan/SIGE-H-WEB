-- D1 PREPARADA, NO APLICADA. Canónica: sustituye las propuestas locales/sesiones de infra/sql/propuestas.
-- No ejecutar conjuntamente esas propuestas. OIDC queda futuro, no se crea su tabla.
-- Propietario autorizado, solo QA; después revisar/aplicar permisos por separado en D2.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sigeh_qa' OR session_user<>'sigeh_qa_bootstrap' OR current_user<>session_user
 OR current_setting('server_version_num')::int/10000<>17 THEN RAISE EXCEPTION 'Destino V2 incorrecto'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r')<>51
 OR (SELECT count(*) FROM pg_constraint WHERE connamespace='sigeh'::regnamespace)<>261
 OR (SELECT count(*) FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='i')<>87
 OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sigeh'::regnamespace AND NOT t.tgisinternal)<>8
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='sigeh'::regnamespace AND NOT convalidated)
 THEN RAISE EXCEPTION 'Baseline V1 divergente'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relname IN
 ('usuario_credenciales','sesiones_usuario','refresh_tokens_sesion','iam_limites_acceso',
  'auditoria_seguridad','usuario_roles_contexto','encargo_permisos')) THEN
 RAISE EXCEPTION 'V2 parcial/preexistente: revisar, nunca sobreescribir'; END IF;
END $$;
CREATE TABLE sigeh.usuario_credenciales (
 usuario_id uuid PRIMARY KEY REFERENCES sigeh.usuarios(usuario_id),
 password_hash text NOT NULL CHECK(password_hash ~ '^\$argon2id\$v=19\$'),
 algoritmo varchar(20) NOT NULL DEFAULT 'ARGON2ID' CHECK(algoritmo='ARGON2ID'),
 actualizada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 requiere_cambio boolean NOT NULL DEFAULT true,
 intentos_fallidos integer NOT NULL DEFAULT 0 CHECK(intentos_fallidos>=0),
 bloqueada_hasta timestamptz
);
CREATE TABLE sigeh.sesiones_usuario (
 sesion_id uuid PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES sigeh.usuarios(usuario_id),
 creada_en timestamptz NOT NULL, expira_en timestamptz NOT NULL,
 ultima_actividad_en timestamptz NOT NULL, inactiva_en timestamptz NOT NULL,
 revocada_en timestamptz, motivo_revocacion varchar(40),
 CHECK(creada_en<expira_en), CHECK(ultima_actividad_en>=creada_en),
 CHECK(inactiva_en>ultima_actividad_en AND inactiva_en<=expira_en),
 CHECK(revocada_en IS NULL OR revocada_en>=creada_en),
 CHECK((revocada_en IS NULL)=(motivo_revocacion IS NULL))
);
CREATE INDEX idx_iam_sesiones_usuario ON sigeh.sesiones_usuario(usuario_id,creada_en DESC);
CREATE TABLE sigeh.refresh_tokens_sesion (
 token_id uuid PRIMARY KEY, sesion_id uuid NOT NULL REFERENCES sigeh.sesiones_usuario(sesion_id),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 emitido_en timestamptz NOT NULL DEFAULT clock_timestamp(), expira_en timestamptz NOT NULL,
 consumido_en timestamptz, revocado_en timestamptz,
 reemplazado_por uuid UNIQUE REFERENCES sigeh.refresh_tokens_sesion(token_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(expira_en>emitido_en), CHECK(consumido_en IS NULL OR consumido_en>=emitido_en),
 CHECK(revocado_en IS NULL OR revocado_en>=emitido_en),
 CHECK(reemplazado_por IS NULL OR (consumido_en IS NOT NULL AND reemplazado_por<>token_id))
);
CREATE INDEX idx_iam_refresh_familia ON sigeh.refresh_tokens_sesion(sesion_id);
CREATE UNIQUE INDEX uq_refresh_activo_por_sesion ON sigeh.refresh_tokens_sesion(sesion_id)
 WHERE consumido_en IS NULL AND revocado_en IS NULL;
CREATE TABLE sigeh.iam_limites_acceso (
 clave_hash char(64) PRIMARY KEY CHECK(clave_hash ~ '^[0-9a-f]{64}$'),
 ventana_desde timestamptz NOT NULL, intentos integer NOT NULL CHECK(intentos BETWEEN 1 AND 1000000)
);
CREATE TABLE sigeh.usuario_roles_contexto (
 usuario_rol_id uuid PRIMARY KEY REFERENCES sigeh.usuario_roles(usuario_rol_id),
 tipo varchar(10) NOT NULL CHECK(tipo IN ('TITULAR','ENCARGADO')),
 mandato_desde timestamptz NOT NULL, mandato_hasta timestamptz,
 CHECK(mandato_hasta IS NULL OR mandato_hasta>mandato_desde),
 CHECK(tipo<>'ENCARGADO' OR mandato_hasta IS NOT NULL)
);
CREATE TABLE sigeh.encargo_permisos (
 usuario_rol_id uuid NOT NULL REFERENCES sigeh.usuario_roles_contexto(usuario_rol_id),
 permiso_id uuid NOT NULL REFERENCES sigeh.permisos(permiso_id), PRIMARY KEY(usuario_rol_id,permiso_id)
);
CREATE TABLE sigeh.auditoria_seguridad (
 evento_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ocurrido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 evento varchar(40) NOT NULL CHECK(evento IN ('LOGIN_LIMIT','LOGIN_CAPACITY','LOGIN_INVALID','LOGIN_OK',
 'REFRESH_LIMIT','REFRESH_INVALID','REFRESH_REPLAY','REFRESH_EXPIRED','REFRESH_OK',
 'SESSION_REVOKE_DENIED','LOGOUT','SESSION_REVOKED','AUTHORIZATION')),
 resultado varchar(5) NOT NULL CHECK(resultado IN ('ALLOW','DENY')),
 actor_usuario_id uuid REFERENCES sigeh.usuarios(usuario_id),
 objetivo_usuario_id uuid REFERENCES sigeh.usuarios(usuario_id),
 sesion_id uuid REFERENCES sigeh.sesiones_usuario(sesion_id),
 hospital_id uuid REFERENCES sigeh.hospitales(hospital_id),
 division_id uuid REFERENCES sigeh.divisiones(division_id), servicio_id uuid REFERENCES sigeh.servicios(servicio_id)
);
CREATE INDEX idx_iam_auditoria_tiempo ON sigeh.auditoria_seguridad(ocurrido_en);
-- Sin seeds, credenciales, identidades, contextos automáticos ni alteraciones V1.
COMMIT;
