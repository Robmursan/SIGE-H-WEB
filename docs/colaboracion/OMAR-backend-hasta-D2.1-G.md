# Incorporación de Omar — backend hasta D2.1-G

Rama de consolidación: `feat/codex-b1-iam-org`. Backend NestJS 12, ESM y Node >=26 (validado con 26.7.0), PostgreSQL 17. Angular/AGY no forma parte de este cambio.

## Estado que se entrega

- IAM V2 implementado, con autenticación local Argon2id, JWT, sesiones persistentes, rotación/revocación de refresh y autorización organizacional. **IAM HTTP sigue deshabilitado** mediante `IAM_V2_ENABLED=false` por defecto. Las rutas están registradas/documentadas, pero su guard devuelve 503 antes de consultar IAM.
- QA tiene V2 y grants instalados según la evidencia de D2.1-G: 58 tablas, 100 índices, 303 restricciones validadas, siete tablas V2 vacías y 73 entradas ACL autorizadas. Esta consolidación Git no volvió a consultar ni modificó PostgreSQL.
- Leer [D1](../iam/D1-implementacion-IAM-V2.md) y la **sección 10, estado actual**, de [D2.1](../iam/D2.1-migracion-IAM-V2-QA.md). Sus secciones anteriores conservan bloqueos/recuperaciones históricos. La migración y los scripts mantienen sus encabezados originales; el informe registra qué se aplicó realmente.
- D2.2/D3, enrolamiento y activación IAM siguen pendientes de autorización. Los grants no prueban RLS ni aislamiento entre hospitales; falta validar concurrencia/rotación y autorización con PostgreSQL en la fase correspondiente.

## Publicación por el responsable (todavía no ejecutada)

Desde esta rama, después de revisar el commit consolidado:

```bash
git push --set-upstream origin feat/codex-b1-iam-org
```

No usar force, merge ni rebase para publicar este trabajo. La creación del commit no publica la rama.

## Clonar o recuperar la rama una vez publicada

Clon nuevo, con acceso SSH al repositorio:

```bash
git clone --branch feat/codex-b1-iam-org --single-branch git@github.com:Robmursan/SIGE-H.git SIGE-H
cd SIGE-H
git log -1 --oneline
```

En una copia existente, primero comprobar que no haya trabajo local que sobrescribir. Una rama nueva de colaboración permite conservar intacta la base recibida:

```bash
git status --short
git fetch origin
git switch -c omar/backend-iam-v2 origin/feat/codex-b1-iam-org
```

No reutilizar otra rama local con ese nombre sin revisar su estado. Comparar el commit base con el hash comunicado por el responsable.

## Calidad local sin PostgreSQL

Con Node >=26 instalado, desde `apps/api`:

```bash
npm ci
npm run build
npm run lint
node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json
npm test
npm run test:e2e
```

Estas suites unitarias/HTTP usan mocks y un tripwire de Pool; no necesitan QA, `.env`, credenciales reales ni usuarios enrolados. Evidencia de consolidación: build/lint/TypeScript PASS, **125 unitarias y 24 HTTP locales**, sin conexión a bases. Los WARN de COMMIT/ROLLBACK en unitarias son escenarios simulados esperados.

Validaciones estáticas desde la raíz, sin SQL ni sockets:

```bash
python3 scripts/qa/c1/verificar-estatico.py
python3 scripts/qa/c1.1/verificar-estatico.py
python3 scripts/qa/d1-validar-migracion.py
```

Los validadores C1/D1 verifican también el maestro V1 externo en la ruta documentada del equipo de origen; en otra máquina requieren acceso autorizado a ese archivo inmutable. No ejecutar el maestro para satisfacer esa comprobación.

## Credenciales y operaciones fuera de esta entrega

`apps/api/.env.example` es una plantilla sin secretos, no una credencial. El runtime no carga `.env` automáticamente: usa configuración explícita y contraseña app externa, por defecto `~/.config/sigeh/qa-app/password` (directorio 0700, archivo 0600). No copiar credenciales bootstrap, JWT ni archivos secretos por Git. Su entrega/custodia debe acordarse por un canal autorizado. Un clon no queda autorizado para conectarse a QA por el hecho de compilar.

No ejecutar ahora migraciones, grants, rollback, propuestas HBA, `start:qa`, integration ni smoke. `test:qa:readonly` conserva expectativas V1 de 51/261 y está pendiente de adaptación autorizada; no usarlo como validación de QA V2. El lanzador Python C1 es histórico y no es el mecanismo runtime vigente; C2.3 usa el lanzador Node y archivo externo. Ninguno debe iniciarse como parte de las pruebas locales anteriores.

Health/version y Swagger `/docs` conservan sus contratos. No se habilita IAM ni se inicia backend en esta consolidación. No tocar `sigeh_postgres`, `sigeh_db`, HBA, roles, redes o volúmenes.

## Alcance y exclusiones del commit

Se incluyen código/configuración QA segura, pruebas, `.env.example` sin valores secretos, SQL versionado, herramientas C1/D1 y documentación C1–D2.1-G con su historial. No se incluyen archivos de AGY, credenciales, `.env` locales, JWT serializados, dumps, respaldos, logs, dependencias, compilados, cachés ni utilidades temporales `/tmp`.

`Untitled` es un archivo local preexistente sin identificar: queda ignorado, fuera del commit, sin abrir ni borrar. Los respaldos y secretos externos permanecen fuera del repositorio. La única cadena con apariencia de URL de credencial detectada en los candidatos corresponde a una prueba ficticia preexistente de redacción, no a una credencial operativa.

La revisión staged debe confirmar esta lista, ausencia de secretos y `git diff --cached --check` limpio antes del único commit. Revisar de nuevo esos controles antes de cualquier publicación futura.
