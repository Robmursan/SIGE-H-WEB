-- L3A SOLO LECTURA, NO EJECUTADO. Cero filas de personas; comprobar con rol app.
SELECT current_database(),current_user;
SELECT c.relname,a.attname,has_column_privilege('sigeh_qa_app',c.oid,a.attnum,'SELECT') AS can_read
FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
WHERE c.relnamespace='sigeh'::regnamespace AND c.relname IN ('empleados','contratos','adscripciones','programacion_laboral','horarios') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2;
-- Esperado false antes/despues: columnas fuera del minimo, DML, tabla completa y secuencias.
SELECT has_column_privilege('sigeh_qa_app','sigeh.empleados','rud','SELECT') AS rud,
 has_column_privilege('sigeh_qa_app','sigeh.empleados','segundo_apellido','SELECT') AS segundo_apellido,
 has_column_privilege('sigeh_qa_app','sigeh.contratos','tipo','SELECT') AS tipo_contrato,
 has_column_privilege('sigeh_qa_app','sigeh.contratos','categoria_id','SELECT') AS categoria,
 has_table_privilege('sigeh_qa_app','sigeh.empleados','SELECT') AS whole_table,
 has_any_column_privilege('sigeh_qa_app','sigeh.empleados','INSERT,UPDATE,REFERENCES') AS employee_write;
-- Pruebas activas de denegacion futuras (requieren autorizacion), una por sesion READ ONLY:
-- SELECT rud FROM sigeh.empleados WHERE false; esperado 42501, nunca registrar filas.
-- SELECT * FROM sigeh.empleados WHERE false; esperado 42501.
-- Las ACL NO filtran hospitales: probar acceso cruzado en HTTP/politica y SQL scoped del repositorio,
-- no afirmar que SELECT directo sobre columnas concedidas deniegue filas de otro hospital.
