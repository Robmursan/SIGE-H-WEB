# QA B1 preparada, no iniciada

Servicio actual confirmado por docker ps: sigeh_postgres, postgres:17-alpine, 0.0.0.0:5432 y [::]:5432. Compose externo contiene 5432:5432. No se modificó ni reinició. La propuesta de bind localhost puede cortar clientes LAN; falta identificar consumidores/firewall y autorización del propietario. No se puede certificar que no rompa dependencias.

compose.qa.yaml define otro proyecto (sigeh-qa-b1), otro volumen/red interna, puerto host 127.0.0.1:55432, base sigeh_qa y usuario bootstrap exclusivo. El bootstrap de la imagen crea infraestructura si se lanza: requiere autorización previa. No monta SQL maestro, migraciones ni init scripts. No se accede a volúmenes existentes. Se usa secreto externo por archivo; no hay contraseña ni .env con secretos en Git.

Secuencia pendiente para operador autorizado:

1. Autorizar arranque del cluster QA y gestión de secreto externo. Mantener propietario/ubicación fuera de Git con permisos mínimos. Validar Compose sin levantar contenedores: SIGEH_QA_ADMIN_PASSWORD_FILE=<archivo> docker compose -f infra/qa/compose.qa.yaml config --quiet. La validación no verifica firewall, secreto real ni servicio.
2. Proveer baseline V1 aprobada con las 51 tablas y cero datos institucionales. No repetir SQL maestro ni restaurar datos personales bajo esta entrega. Fuente/huella/propietario de baseline requieren confirmación humana.
3. Revisar y autorizar propuesta-rol-qa-lectura.sql. El rol sigeh_qa_app no hereda privilegios elevados ni tiene LOGIN hasta aprovisionar credencial fuera de scripts/logs. No es rol institucional.
4. Autorizar/aplicar exclusivamente en QA las inserciones de fixtures-org.propuesta.sql, con bootstrap fuera de API. No son migraciones de producción. No se ejecutaron aquí. El fixture falla ante colisiones y conserva las tablas; no borra datos.
5. Entregar variables mediante gestor de secretos: SIGEH_QA_INTEGRATION=1, NODE_ENV=test, DB_HOST=127.0.0.1, DB_PORT=55432, DB_NAME=sigeh_qa, DB_USER=sigeh_qa_app, DB_PASSWORD y JWT_SECRET seguros. No imprimir valores. npm run test:integration exige esos valores antes de importar AppModule; qa-preflight verifica rol efectivo, membresías elevadas, 51 tablas y ausencia de privilegios de escritura. Su sonda es solo lectura.

El preflight no sustituye la autorización de destino ni demuestra origen saneado del baseline. Los tests de este lote son solo lectura y no crean fixtures, roles, tablas o migraciones. Pruebas de escritura se mantienen prohibidas hasta autorización específica de la QA aislada. No se preparan comandos down -v ni limpieza de volúmenes compartidos.

Token revocado, refresh reutilizado y logout efectivos requieren proveedor/sesiones reales; no se reportan como probados por estas pruebas SQL de ámbito.

Referencia primaria para secretos por archivo: https://docs.docker.com/compose/how-tos/use-secrets/ .
