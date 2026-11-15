-- PROPUESTA V2 NO EJECUTADA; requiere decisión de identidad y aprobación SQL separada.
-- No altera/recrea ninguna de las 51 tablas V1. Evaluar sobre baseline QA autorizada.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sigeh_qa' THEN RAISE EXCEPTION 'Aplicación limitada a QA autorizada'; END IF;
END $$;
-- Aplicar SOLO si se aprueba identidad local; no necesaria para proveedor OIDC.
CREATE TABLE sigeh.usuario_credenciales (
 usuario_id uuid PRIMARY KEY REFERENCES sigeh.usuarios(usuario_id),
 password_hash text NOT NULL CHECK(length(password_hash) >= 20),
 algoritmo varchar(20) NOT NULL CHECK(algoritmo IN ('ARGON2ID','BCRYPT')),
 actualizada_en timestamptz NOT NULL DEFAULT now(),
 requiere_cambio boolean NOT NULL DEFAULT true,
 intentos_fallidos integer NOT NULL DEFAULT 0 CHECK(intentos_fallidos >= 0),
 bloqueada_hasta timestamptz
);
COMMIT;
-- Parámetros de hashing/rate limit/MFA/recuperación requieren política y pruebas antes de login.
-- No se crean cuentas, contraseñas ni rutas; no se modifica sigeh.usuarios.
