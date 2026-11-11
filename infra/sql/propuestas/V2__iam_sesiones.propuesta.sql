-- PROPUESTA V2 NO EJECUTADA; requiere decisión de identidad y aprobación SQL separada.
-- No altera/recrea ninguna de las 51 tablas V1. Evaluar sobre baseline QA autorizada.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sigeh_qa' THEN RAISE EXCEPTION 'Aplicación limitada a QA autorizada'; END IF;
END $$;
CREATE TABLE sigeh.sesiones_usuario (
 sesion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id uuid NOT NULL REFERENCES sigeh.usuarios(usuario_id),
 creada_en timestamptz NOT NULL DEFAULT now(), expira_en timestamptz NOT NULL,
 revocada_en timestamptz, motivo_revocacion varchar(80),
 CHECK(expira_en > creada_en), CHECK(revocada_en IS NULL OR revocada_en >= creada_en)
);
CREATE INDEX idx_sesiones_usuario ON sigeh.sesiones_usuario(usuario_id, expira_en);
CREATE TABLE sigeh.refresh_tokens_sesion (
 token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sesion_id uuid NOT NULL REFERENCES sigeh.sesiones_usuario(sesion_id),
 token_hash varchar(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 emitido_en timestamptz NOT NULL DEFAULT now(), expira_en timestamptz NOT NULL,
 consumido_en timestamptz, revocado_en timestamptz,
 reemplazado_por uuid UNIQUE REFERENCES sigeh.refresh_tokens_sesion(token_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(expira_en > emitido_en),
 CHECK(consumido_en IS NULL OR consumido_en >= emitido_en),
 CHECK(revocado_en IS NULL OR revocado_en >= emitido_en),
 CHECK(reemplazado_por IS NULL OR consumido_en IS NOT NULL),
 CHECK(reemplazado_por IS NULL OR reemplazado_por <> token_id)
);
CREATE UNIQUE INDEX uq_refresh_activo_por_sesion ON sigeh.refresh_tokens_sesion(sesion_id)
 WHERE consumido_en IS NULL AND revocado_en IS NULL;
COMMIT;
-- Sesión como familia: lock FOR UPDATE, consumir anterior antes de insertar siguiente.
-- Conservar hashes consumidos para detectar replay; revocar familia, no reintentar COMMIT incierto.
-- Sin grants, semillas, passwords, activación ni rollback destructivo automático.
