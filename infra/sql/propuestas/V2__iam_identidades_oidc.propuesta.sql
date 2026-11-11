-- PROPUESTA V2 NO EJECUTADA; requiere decisión de identidad y aprobación SQL separada.
-- No altera/recrea ninguna de las 51 tablas V1. Evaluar sobre baseline QA autorizada.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sigeh_qa' THEN RAISE EXCEPTION 'Aplicación limitada a QA autorizada'; END IF;
END $$;
-- Alternativa a credenciales locales si se autoriza IdP con issuer y subject reales.
CREATE TABLE sigeh.identidades_oidc (
 identidad_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id uuid NOT NULL REFERENCES sigeh.usuarios(usuario_id),
 issuer text NOT NULL CHECK(length(issuer) > 0), subject text NOT NULL CHECK(length(subject) > 0),
 creada_en timestamptz NOT NULL DEFAULT now(), activa boolean NOT NULL DEFAULT true,
 UNIQUE(issuer, subject)
);
COMMIT;
-- Alta del vínculo con revisión humana; no auto-vincular por email/identificador.
-- Issuer allowlist/JWKS/audience son configuración autorizada; ningún IdP se habilita aquí.
