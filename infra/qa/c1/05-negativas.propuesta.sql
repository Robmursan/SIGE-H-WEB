-- NO EJECUTADO. Contiene intentos DDL/DML: PROHIBIDO EN C1, incluso con ROLLBACK.
-- Manual, una sentencia por transacción. Requiere autorización adicional para pruebas.
-- Conectar como app por TCP con SCRAM; comprobar identidad en 04 primero.
-- Retirar read-only EN ESA TRANSACCIÓN evita confundir 25006 con denegación ACL 42501.
BEGIN READ WRITE;
CREATE TABLE sigeh.c1_probe (id integer); -- esperado 42501
ROLLBACK;
BEGIN READ WRITE;
CREATE TABLE public.c1_probe (id integer); -- esperado 42501
ROLLBACK;
BEGIN READ WRITE;
CREATE TEMP TABLE c1_probe (id integer); -- esperado 42501
ROLLBACK;
BEGIN READ WRITE;
ALTER SCHEMA sigeh RENAME TO c1_probe; -- esperado 42501
ROLLBACK;
BEGIN READ WRITE;
CREATE ROLE c1_probe NOLOGIN; -- esperado 42501
ROLLBACK;
BEGIN READ WRITE;
UPDATE sigeh.roles SET nombre=nombre WHERE false; -- esperado 42501; cero filas si ACL falla
ROLLBACK;
BEGIN READ WRITE;
ALTER TABLE sigeh.hospitales ADD COLUMN c1_probe integer; -- esperado 42501
ROLLBACK;
SELECT hospital_id FROM sigeh.hospitales WHERE false; -- esperado 42501 en perfil actual
SELECT empleado_id FROM sigeh.empleados WHERE false; -- esperado 42501 fuera de inventario
-- Si devuelve éxito, DETENER y registrar fallo, aunque ROLLBACK deshaga DDL.
-- No es suite automatizada: psql ON_ERROR_STOP terminaría antes del rollback esperado.
-- Usar sesiones separadas y verificar SQLSTATE (\set VERBOSITY sqlstate) + ROLLBACK explícito.
