# C1 — roles y credenciales PostgreSQL QA

Estado: PREPARADO_NO_EJECUTADO. C2 BLOQUEADA_POR_SEGURIDAD. Fecha: 2026-11-11.
Encargo de infraestructura C1; no implementa un CU funcional nuevo. Soporta CU-OPS-01/02/03 existentes y prepara dependencias de CU-IAM-01 y lecturas CU-ORG-01/04/07/10. No habilita C2, D ni E.

## Fuentes, alcance y límites

Orden aplicado: maestro V1 externo y catálogo QA observado; especificación `docs/casos-uso/SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md`; guía raíz `SIGE-H_GUIA_PASO_A_PASO_DESARROLLO_CON_AGENTES_v1_0.md`; fichas existentes. Un estado AC de la especificación no prueba implementación HTTP.

Maestro inspeccionado sin modificar: `/home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql`.
SHA-256 verificado: `3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088`.
Destino futuro único: QA, base `sigeh_qa`, contenedor `sigeh-qa-b1-postgres-qa-1`, TCP host `127.0.0.1:55432`. La identidad de servidor/volumen deberá revalidarse antes de aplicar; comprobar base/usuario/version no identifica por sí solo un cluster clonado.

Se inspeccionaron Git, módulos Pool/health/IAM/organización, validación de entorno, Compose, pruebas y propuestas V2. No se leyeron archivos secretos `.env` ni filas hospitalarias. El archivo no versionado `Untitled` preexistía y no fue abierto ni modificado. Rama observada: `feat/codex-b1-iam-org`. No hubo commits, pushes, merges ni cambios a archivos previos.

## Diagnóstico observado mediante SELECT

Consulta por `docker exec ... psql -X -U sigeh_qa_bootstrap -d sigeh_qa -v ON_ERROR_STOP=1 -c ...`, exclusivamente SELECT de catálogos. El primer intento fue denegado por el sandbox; la repetición autorizada terminó con código 0. La conexión fue por socket dentro del contenedor, no una prueba de autenticación TCP.

| Elemento | Evidencia | Consecuencia |
|---|---|---|
| Motor | PostgreSQL 17.11 | Revisar ACL efectivas, incluido MAINTAIN de PG17 |
| Bootstrap | LOGIN, SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS | Exclusivamente administración/migraciones autorizadas; nunca API |
| App | No aparece `sigeh_qa_app` en pg_roles | No se ha creado ni probado autenticación |
| Ownership | Bootstrap posee esquema sigeh, 51 tablas, 87 índices, 4 secuencias, 1 vista | App no debe heredar propiedad ni membresías |
| ACL relaciones | Las relaciones sigeh observadas no tienen ACL explícitas | Interpretar defaults, no asumir grants vacíos |
| Base | QA y postgres con datacl NULL; templates con CONNECT PUBLIC | No puede afirmarse CONNECT exclusivo QA |
| public | Dueño pg_database_owner; PUBLIC USAGE, sin CREATE PUBLIC explícito | No hallazgo actual de CREATE PUBLIC en ese esquema; mantener auditoría |
| sigeh | Dueño bootstrap, ACL NULL | Uso app requiere grant explícito |
| Rutinas sigeh | Dos funciones trigger, SECURITY INVOKER, sin proconfig ni ACL explícita | EXECUTE PUBLIC por default; no se justifica grant app adicional |
| Extensiones | plpgsql en pg_catalog; pgcrypto y btree_gist en public, propiedad bootstrap | Revisar rutinas/dependencias de extensiones antes de cualquier revocación |
| Autenticación | password_encryption=scram-sha-256; seis reglas trust y una host SCRAM en pg_hba_file_rules | BLOQUEO: SCRAM de almacenamiento no garantiza SCRAM efectivo de conexión |
| Transporte | ssl=off | No confidencialidad TLS verificada |
| search_path sesión | "$user", public | Distinto del que fuerza Pool |

La primera lectura de HBA no incluyó address/netmask ni rule_number. No se afirma qué rangos TCP coinciden con trust. La consulta completa preparada en `01-auditoria.sql` incluye esos campos; requiere revisión de primer match, reglas de replicación, consumidores y prueba TCP posterior, antes de desbloquear. También quedan pendientes ACL por columna, membresías completas, defaults, rutinas fuera de sigeh y ajustes por rol/base; el script los inventaría. No se recuperaron verificadores de contraseña ni definiciones de funciones que pudieran contener secretos.

BLOQUEO adicional de configuración: Pool fuerza `search_path=${DB_SCHEMA},public` vía opciones de conexión; un ALTER ROLE no prevalece sobre ese valor del cliente. Su DB_SCHEMA está validado como identificador, y los repositorios califican `sigeh.`; sigue pendiente retirar public del path efectivo y comprobar confianza de los creadores. No se modifica código Nest en C1. No se afirma que la API activa use bootstrap: no se leyeron sus credenciales de ejecución.

Compose versionado dice `internal: true`, mientras el contexto verificado reporta red viva `internal=false`. No se ejecutó Compose ni inspeccionó/modificó red/volumen para reconciliarlo. La diferencia exige revisión de exposición antes de C2, sin recrear infraestructura.

## Inventario y matriz mínima

Los controladores publicados en código son raíz API, salud y meta/version. IAM y organización tienen providers/usecases/repositorios pero carecen de controladores HTTP; el verificador de identidad está indisponible. Las rutas de especificación no son rutas efectivas.

| Objeto/operación | Perfil app AHORA | Justificación / futuro condicionado |
|---|---|---|
| Base sigeh_qa | CONNECT | Readiness requiere conexión; exclusividad depende de PUBLIC/otras bases/HBA |
| Esquema sigeh | USAGE | Visibilidad del esquema en information_schema.schemata para readiness |
| SELECT 1, catálogos de metadatos | Acceso estándar | Salud, sin filas de negocio |
| hospitales | Ninguno | Futuro SELECT catálogo, joins activos y ámbitos hospitalarios |
| divisiones | Ninguno | Futuro SELECT catálogo y consistencia división/hospital |
| servicios | Ninguno | Futuro SELECT catálogo y consistencia servicio/división/hospital |
| subareas | Ninguno | Futuro SELECT catálogo y servicio/hospital |
| usuarios | Ninguno | Futuro SELECT de usuario_id/activo en repositorios; evitar identificador/empleado_id salvo CU aprobado |
| usuario_roles | Ninguno | Futuro SELECT ámbitos y vigencias, nunca asignación implícita |
| roles | Ninguno | Futuro SELECT para joins; escritura solo con CU administrativo autorizado |
| permisos | Ninguno | Futuro SELECT código de permiso |
| rol_permisos | Ninguno | Futuro SELECT relación rol/permiso |
| Otras 42 tablas V1 y vista | Ninguno | Sin endpoint que las requiera; incluye historial y empleados |
| Cuatro secuencias V1 | Ninguno | Cero inserciones; no asumir que UUID elimina todas las secuencias existentes |
| Funciones/extensiones | Ningún grant nuevo | Acceso PUBLIC existente requiere auditoría individual, no equivale a aislamiento |
| Esquemas/base | Sin CREATE ni TEMPORARY efectivos | Incluye permisos sumados desde PUBLIC; requiere saneamiento revisado |
| TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | Ninguno | Ninguna operación implementada lo requiere |
| usuario_credenciales (V2 propuesta) | Ninguno | Futuro SELECT hash/estado y UPDATE de contadores/bloqueo por columnas, según CU-IAM-01 aprobado |
| sesiones_usuario/refresh_tokens_sesion (V2 propuesta) | Ninguno | Futuro SELECT/INSERT y UPDATE limitado para rotación/revocación transaccional |
| identidades_oidc (V2 alternativa) | Ninguno | Futuro SELECT de vínculo validado; sin autovincular ni permisos de alta implícitos |

No se crea rol NOLOGIN de lectura/escritura: una cuenta y cero DML no justifican membresías adicionales; simplifica verificar que no hay SET ROLE ni herencia transitiva. No se concede SELECT en bloque a nueve tablas solo porque existe código de repositorio. Al autorizar lecturas, revisar permisos por columna, especialmente usuarios, y actualizar pruebas exactas. No hay ALTER DEFAULT PRIVILEGES nuevo: ningún objeto futuro está aprobado. Cualquier necesidad posterior debe indicar creador real, esquema, tipo y efecto; una revocación solo por esquema no elimina defaults globales preexistentes de EXECUTE.

Los permisos SQL limitan objetos/columnas; no filtran hospitales. Incluso SELECT por columna permite leer filas de todos los hospitales si no hay RLS validada. Los predicados y vigencias de la API son controles separados. No se crean políticas RLS ni se acredita aislamiento multihospital. `default_transaction_read_only` es defensa operativa que el cliente puede desactivar, no un control de autorización.

## Plan y precondiciones de C2 (detenida)

1. Nueva autorización explícita para C2 y por separado para remediar HBA/configuración. Inventariar consumidores y captura segura de ACL antes de cambios.
2. Revalidar contenedor, volumen y puerto exclusivos QA. No conectar al puerto 5432 del host ni al cluster institucional. No usar scripts antiguos destinados a sigeh_db.
3. Auditar HBA completo; diseñar SCRAM para los destinos/usuarios concretos y rechazo de rutas no autorizadas. No editar/reload HBA en C1. Guardar acceso administrativo seguro para evitar bloqueo. Evaluar TLS o una excepción local QA acotada, nunca aceptar certificados sin verificar.
4. Resolver divergencia de red y path forzado por Pool con revisión propia. Verificar path efectivo mediante conexión real de la API después del cambio autorizado.
5. Revisar PUBLIC: CONNECT sobre postgres/templates permite conexión a otras bases, aunque sin tablas de negocio. TEMPORARY en QA permite crear tablas temporales. No existe REVOKE negativo por rol que anule PUBLIC. Revisar y autorizar cada revocación y los grants de consumidores afectados antes de quitarla. `03` solo contiene ejemplos comentados; no es remediación ejecutable.
6. Auditar ownership, membresías (incluido SET/INHERIT de PG17), ACL por columnas, rutinas SECURITY DEFINER, extensiones y defaults. Una función SECURITY DEFINER accesible puede elevar privilegios; revisar cuerpo, owner, EXECUTE y path confiable con pg_temp al final antes de conceder nada. Las dos de sigeh observadas no lo son; falta revisión global completa.
7. Solo con guardas satisfechas, revisar y autorizar `02`. Crea LOGIN con PASSWORD NULL para no introducir credenciales en SQL versionado. No altera bootstrap ni roles existentes. Guarda estricta rechaza cualquier trust; no improvisar excepciones para hacerla pasar.
8. Aprovisionar contraseña mediante el mecanismo siguiente; autenticar TCP como app y ejecutar verificaciones SELECT. Revisar todos los resultados, no basta exit code 0.
9. Pruebas activas negativas de `05` requieren autorización adicional; no ejecutar en C1 ni disparar como suite E2E. Cada intento tiene rollback y SQLSTATE esperado; cualquier éxito es fallo de seguridad.

## Credenciales e inyección

El generador propuesto `scripts/qa/c1/generar-secreto.py` usa secrets.token_urlsafe(48), 384 bits aleatorios, 64 caracteres ASCII sin separadores SQL ni newline. Crea directorio externo NUEVO 0700 y archivo `app-password` 0600 usando O_EXCL/O_NOFOLLOW; no imprime contenido ni sobreescribe archivos. No se ejecutó ni se generaron credenciales en C1. Ejecutar solo bajo cuenta local confiable, padre privado sin enlaces controlados por terceros, almacenamiento local cifrado y backups con permisos equivalentes. No usar /tmp compartido como almacenamiento persistente. La revisión estática no sustituye validar permisos/propietario efectivos.

Mecanismo propuesto de alta de contraseña: psql 17 `\password sigeh_qa_app` en terminal interactivo seguro, con `password_encryption` SCRAM confirmado y contraseña aleatoria desde gestor local aprobado/autocompletado en ambos prompts ocultos. El gestor debe importar el archivo externo sin imprimirlo. No usar cat, echo, sustitución de shell, argumentos SQL PASSWORD, historial ni grabación de terminal; si no existe un canal seguro de entrada, detener aprovisionamiento. psql cifra antes de enviar ALTER ROLE; evita exponer texto claro en SQL/historial/log del servidor, pero el verificador SCRAM sigue siendo material sensible: revisar logs, captura de terminal y permisos administrativos. No hay interpolación SQL artesanal, concatenación de contraseña ni password en argv. Es una operación de C2 que modifica el rol, no debe ejecutarse ahora.

`iniciar-api.py` es un lanzador preparado, NO ejecutado: valida propietario/modos, archivo regular sin enlaces y formato; fija destino QA y usuario app, elimina DATABASE_URL e inyecta DB_PASSWORD solo en entorno del proceso Node mediante exec. Carga otros valores requeridos (como JWT_SECRET) por los mecanismos externos actuales; no genera JWT ni modifica .env. El backend exige DB_PASSWORD y no soporta DB_PASSWORD_FILE; el lanzador resuelve esa incompatibilidad sin modificar NestJS. Entorno no es una bóveda: procesos del mismo usuario, administrador y crash dumps podrían leerlo; limitar cuenta y diagnósticos. No usar env/printenv, logs de configuración ni volcados del proceso. No lanzar hasta resolver path/HBA y autorizar C2.

Fish: los comandos de Python/psql siguientes usan argumentos simples compatibles con Fish y Bash; no requieren export ni sintaxis VAR=valor. No usar `set -gx DB_PASSWORD (cat ...)`. No hay cambio a shell o archivos de inicio. Se detectó `/usr/bin/fish`; no se ejecutó la inyección ni se verificó un arranque real.

Compose: POSTGRES_PASSWORD_FILE y el secret existente corresponden al bootstrap durante inicialización del volumen, no configuran la contraseña de app ni la rotan en una base ya inicializada. El servicio actual solo es PostgreSQL, no NestJS. No agregar password app como POSTGRES_PASSWORD. Un futuro servicio API puede montar el secreto de app como archivo de solo lectura y usar un lector equivalente; verificar uid/permisos reales dentro del contenedor. Los secrets locales de Compose no implican cifrado en disco. No ejecutar up, restart, down, config con valores secretos ni recrear redes/volúmenes.

La autenticación SCRAM necesita verificador SCRAM y una regla HBA efectiva compatible. TLS protege el transporte; SCRAM no cifra el tráfico SQL posterior. No afirmar conexión segura con ssl=off y reglas trust presentes.

## Comandos futuros exactos — NO EJECUTADOS

Desde `/home/robreport/Documents/SIGE-H-b1-iam-org`. Requieren cliente psql 17 en host (no está disponible actualmente), terminal sin registro, credencial bootstrap en entrada oculta y revisión de identidad. No ejecutar esta secuencia mientras haya bloqueos. No se dan comandos de modificación de contenedores/redes/volúmenes ni correcciones automáticas HBA.

```sh
psql -X -h 127.0.0.1 -p 55432 -U sigeh_qa_bootstrap -d sigeh_qa -W -v ON_ERROR_STOP=1 -f infra/qa/c1/01-auditoria.sql
```

Después de resolver y volver a revisar los bloqueos bajo autorización separada:

```sh
psql -X -h 127.0.0.1 -p 55432 -U sigeh_qa_bootstrap -d sigeh_qa -W -v ON_ERROR_STOP=1 -f infra/qa/c1/02-provision.propuesta.sql
python3 scripts/qa/c1/generar-secreto.py /home/robreport/.local/share/sigeh-qa-c1
psql -X -h 127.0.0.1 -p 55432 -U sigeh_qa_bootstrap -d sigeh_qa -W -v ON_ERROR_STOP=1
```

En esa sesión administrativa, sin registrar los prompts:

```text
SELECT current_database(),current_user,current_setting('password_encryption');
\password sigeh_qa_app
\q
```

Después, entrada oculta de la contraseña app; no pasar PGPASSWORD ni URI con credencial:

```sh
psql -X -h 127.0.0.1 -p 55432 -U sigeh_qa_app -d sigeh_qa -W -v ON_ERROR_STOP=1 -f infra/qa/c1/04-verificacion.sql
python3 scripts/qa/c1/iniciar-api.py /home/robreport/.local/share/sigeh-qa-c1/app-password
```

El generador requiere que `/home/robreport/.local/share` exista con padres confiables; si el directorio final existe abortará. No reutilizar ni borrar un secreto previo automáticamente. Arrancar API requiere build y configuración JWT segura previa. La provisión SQL no acredita autenticación; no ejecutar ningún comando posterior si falla.

## Pruebas y aceptación

Evidencia local detallada en `C1-evidencia.md`. `01` y `04` contienen únicamente SELECT; no invocan funciones administrativas de escritura. `02`, `05`, `06` NO ejecutados. La sintaxis SQL no se validó en un servidor ni parser PostgreSQL; el validador estático verifica contratos textuales, no sustituye C2.

Criterios de aceptación para una fase futura:

- Auditados PUBLIC y todas las bases: app CONNECT QA=true, otras=false; CREATE/TEMPORARY false; ningún esquema con CREATE app.
- App atributos seguros, LOGIN, sin membresías entrantes/salientes ni ownership en cluster. Bootstrap no aparece en configuración de API.
- Sin privilegios efectivos sobre tablas/vistas de negocio, columnas ni secuencias; sin elevación mediante SECURITY DEFINER. Revisar acceso PUBLIC a funciones estándar/extensiones por separado.
- Readiness positivo SELECT 1 + esquema visible; consultas negativas `05` devuelven 42501, no 25006 ni error de sintaxis. Cambiar a READ WRITE en las pruebas impide que la defensa operativa oculte grants indebidos.
- Probar autenticación TCP SCRAM con contraseña correcta y rechazo con contraseña incorrecta y rutas/roles no permitidos, sin registrar ninguna; no ejecutado aquí. No usar rol bootstrap ni SET ROLE como sustituto de conexión app.
- Ningún grant V2, ninguna afirmación de aislamiento por hospital, ningún DDL del maestro modificado.

`04` es una lista de comprobaciones para revisión humana, no un runner de aserciones. Esperar identidad/readiness/atributos/sin_membresias/sin_ownership verdaderos; CONNECT solo QA, CREATE/TEMP false en todas las bases, CREATE esquema false; listas de violaciones vacías. Los catálogos PostgreSQL normalmente visibles no son objetos de negocio privados.

## Matriz de riesgos

| Riesgo | Nivel | Acción / estado |
|---|---|---|
| HBA trust, bootstrap superusuario | Bloqueante | Detenida aplicación; revisar reglas y consumidores con autorización |
| Credencial bootstrap en API | Crítico si ocurre | Uso activo no observado; separar cuenta y comprobar entorno sin exponer secretos |
| PUBLIC CONNECT/TEMP | Alto | ACL suman privilegios; revocaciones afectan otros consumidores; revisión individual |
| search_path Pool incluye public | Alto | Corregir solo tras autorizar; comprobar path efectivo, no confiar en ALTER ROLE |
| SSL off/red internal=false reportada | Alto | Revisar exposición y protección de transporte, divergencia Compose; sin cambio C1 |
| SEC DEFINER/default EXECUTE | Alto potencial | Dos trigger INVOKER observados; auditoría global pendiente |
| SQL SELECT futuro cruzando hospitales | Alto | SQL ACL no da aislamiento de filas; pruebas de API/RLS separadas pendientes |
| Historial y auditoría | Alto | Cero writes actuales; no TRUNCATE/UPDATE/DELETE ni bypass de triggers |
| Concurrencia y resultado COMMIT incierto | Alto futuro IAM | Cero DML C1; validar rotación locks/idempotencia al autorizar V2 |
| Offline | Alto si se promete autorización | Sin habilitación offline ni cobertura efectiva; control requiere servidor |
| Secretos en entorno/memoria/backups | Medio/alto | Cuenta local limitada, permisos y exclusión de Git; no volcar entorno |
| Rollback con dependencias nuevas | Alto | RESTRICT; inspeccionar cluster y abortar, sin CASCADE ni DROP OWNED |

## Reversión QA

No hay cambios aplicados que revertir. Para C2: capturar ACL y defaults antes/después en archivo externo protegido, documentar cambios exactos; cerrar pool API y verificar sesiones app antes de actuar. `06` revoca solo dos grants nuevos, borra ajustes del rol/base y elimina el rol con RESTRICT en transacción. Abortará por sesiones, ownership o dependencias inesperadas. No termina sesiones ni reasigna objetos automáticamente. Dependencias en otra base o membresías requieren inspección humana y nueva revisión; no usar DROP OWNED/REASSIGN OWNED/CASCADE.

Si bootstrap o PUBLIC se remediaron en otra actuación, su rollback es específico de los cambios y consumidores capturados: no se restauran defaults globales a ciegas ni HBA trust para facilitar una vuelta atrás. Retirar secret app del gestor/archivo externo siguiendo política local al retirar cuenta; no borrar volúmenes ni volver a bootstrap en la API. Comando futuro, solo tras autorización de reversión:

```sh
psql -X -h 127.0.0.1 -p 55432 -U sigeh_qa_bootstrap -d sigeh_qa -W -v ON_ERROR_STOP=1 -f infra/qa/c1/06-rollback.propuesta.sql
```

## IAM V2 y siguiente trabajo

Las propuestas existentes de credenciales locales, sesiones/refresh y OIDC se inspeccionaron sin modificarlas. No autorizadas: todavía requieren política de hashing y parámetros, rate limiting/bloqueo/recuperación, validación de identidad, matriz de autorización, trazabilidad sin PII, manejo de replay y concurrencia, aprobación de DDL y grants por columnas/operación. No otorgar UPDATE/INSERT a RBAC para resolver login. No crear datos reales ni simular persistencia en memoria.

Siguiente trabajo sugerido: revisión de seguridad que resuelva bloqueos de C2; después autorización explícita de C2. Siguiente CU funcional eventual CU-IAM-01, sin implementarlo aquí ni avanzar D/E.

Rutas existentes en código (sin publicar ni arrancar nada en C1): `GET /api/v1`, `GET /api/v1/health`, `/health/live` y `/health/ready` bajo el mismo prefijo, `GET /api/v1/meta/version`. Swagger configurado en `http://127.0.0.1:3000/docs` si PORT=3000 y SWAGGER_ENABLED=true; disponibilidad runtime no probada. C1 no añade rutas.

Referencias técnicas oficiales consultadas: [privilegios PG17](https://www.postgresql.org/docs/17/ddl-priv.html), [esquemas y confianza del path](https://www.postgresql.org/docs/17/ddl-schemas.html), [SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html), [autenticación](https://www.postgresql.org/docs/17/auth-password.html), [HBA](https://www.postgresql.org/docs/17/auth-pg-hba-conf.html), [psql y password](https://www.postgresql.org/docs/17/app-psql.html).

Etapa C1 preparada. Ningún SQL aplicado. No se modificó PostgreSQL institucional ni PostgreSQL QA.
La frase «ningún SQL aplicado» refiere a cambios: sí se ejecutaron exclusivamente SELECT de auditoría QA, descritos arriba.
