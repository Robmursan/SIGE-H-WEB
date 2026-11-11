# SIGE-H — Manual ejecutable de desarrollo por casos de uso, módulos y gateways

**Edición:** 1.0 · **Fecha de elaboración:** 10 de noviembre de 2026 · **Estado:** guía técnica propuesta, no despliegue certificado.  
**Situación de partida:** NestJS creado con CLI, PostgreSQL 17 en Docker con `SIGE-H_BASE_DATOS_MAESTRA_V1.sql` importado en esquema `sigeh`; 51 tablas, 113 FK y pruebas de integridad 01–02 reportadas satisfactorias.  
**Referencias de lectura obligatoria:** `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` (271 casos de uso, 18 módulos) y `SIGE-H_BASE_DATOS_MAESTRA_V1.sql` (DDL real). Esta guía **no sustituye** ninguno: aterriza cómo implementarlos.  
**Aplicaciones:** API NestJS + Swagger; web Angular; Android Kotlin/Jetpack Compose; WebSocket Socket.IO; PostgreSQL.  
**Alcance:** convertir CUs a software, no importar datos reales ni aprobar reglas institucionales pendientes. Dejar por separado `CONFIRMADO`, `PROPUESTO`, `FUTURO`, y `BLOQUEADO_POR_DECISION`.

> **NO destruir el estado actual:** jamás ejecutar `nest new` dentro del proyecto ya existente, ni repetir SQL maestro, ni activar sincronización automática de ORM, ni borrar volumen Docker, ni ejecutar `docker compose down -v`. Antes de cambios, inspeccionar Git, `package.json`, `src/`, Docker y conexión de BD; trabajar por commits pequeños.

## Índice de navegación

1. Inventario y decisiones iniciales; 2. estructura de repositorio real; 3. PostgreSQL Docker; 4. bootstrap NestJS + Swagger; 5. arquitectura módulos y gateways; 6. autenticación y ámbitos; 7. método de desarrollo de cada CU; 8. contrato API y Swagger; 9. implementación por los 18 módulos; 10. interfaz Angular; 11. interfaz Android; 12. eventos, idempotencia y concurrencia; 13. brechas SQL; 14. pruebas/CI; 15. hoja de ruta; 16. prompts listos para terminal; 17. inventario íntegro de 271 CUs; 18. fuentes y decisiones abiertas.

## 1. Punto de partida y primer inventario (sin modificar código)

Ejecutar **desde la raíz existente del proyecto Nest**, no en una carpeta nueva:

```bash
pwd
ls -la
find src -maxdepth 3 -type f | sort | head -100
cat package.json
cat nest-cli.json 2>/dev/null || true
node --version && npm --version
npm ls @nestjs/core @nestjs/common @nestjs/swagger --depth=0 || true
git status --short
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

La CLI ha evolucionado: un proyecto reciente puede usar **ESM y Vitest**, o **CommonJS y Jest**; **no cambiar formato de módulos ni runner sin revisar `package.json`, `tsconfig` y archivos existentes**. Al crear el proyecto normalmente aparecieron `src/main.ts`, `src/app.module.ts`, archivos `app.controller.ts`, `app.service.ts` y tests. Son punto de partida, no arquitectura final.

Verificar la BD **sin escribir**. Si PostgreSQL corre en Docker, identificar primero servicio y nombre del contenedor (`docker compose ps` o `docker ps`); ejecutar la variante adecuada:

```bash
# Ejemplo SOLO si tu servicio Docker Compose se llama db:
docker compose exec db psql -U <usuario_pg> -d sigeh -c 'SELECT current_database(), current_user;'
docker compose exec db psql -U <usuario_pg> -d sigeh -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='sigeh' AND table_type='BASE TABLE';"
# Si el cliente psql está en el host y el puerto 5432 fue publicado:
psql 'postgresql://<usuario>@127.0.0.1:5432/sigeh' -c 'SELECT current_schema();'
```

**No asumir** que `localhost` dentro del contenedor NestJS apunta al contenedor PostgreSQL: contenedor→contenedor usa nombre DNS del servicio (`db` en el ejemplo); host→contenedor usa el puerto publicado (`127.0.0.1:5432`, si existe). Esquema SQL real: `sigeh`, no `public`. No usar `postgres` superusuario como usuario de aplicación.

**Salida exigida al agente:** `docs/diagnostico-inicial.md`: versión Nest, package manager, ESM/CJS, runner de pruebas, ubicación raíz, Docker (sin secretos), nombre BD/esquema, inventario 51 tablas y decisión explícita de qué no modificar. Si el diagnóstico no coincide con el esperado, detener modificaciones y explicar la diferencia.

### Prompt 01 para tu agente de terminal

> Estás en un repositorio NestJS ya creado. **No ejecutes `nest new`, no borres ni modifiques volúmenes Docker y no alteres la BD.** Lee `package.json`, `nest-cli.json`, `src`, tests, `docker-compose.yml` (si existe), `.gitignore`, SQL maestro y documentación de casos de uso. Identifica versión, sistema de módulos, runner y configuración de PostgreSQL. Ejecuta solo lecturas, genera `docs/diagnostico-inicial.md` con hallazgos, riesgos, próximos archivos por modificar y comandos de verificación. Oculta contraseñas/tokens y no incluyas información de empleados reales.

## 2. Evolución controlada de la estructura de carpetas

**No mover todo de golpe.** Si Nest está en la raíz, mantener raíz y crear módulos bajo `src/modules/`; si el equipo ya usa `apps/api`, respetar su distribución. Estructura objetivo **dentro del proyecto actual**, adicionada poco a poco:

```text
<proyecto-nest-existente>/
├─ src/
│  ├─ main.ts                    # bootstrap, prefijo, Swagger y pipes
│  ├─ app.module.ts              # composición de módulos, mínimo código
│  ├─ common/
│  │  ├─ auth/                   # decorators, guards y contexto de actor
│  │  ├─ errors/                 # dominio -> HTTP
│  │  ├─ filters/                # errores estructurados
│  │  ├─ interceptors/           # trazabilidad, correlation-id
│  │  └─ validation/             # DTOs/intervalos comunes
│  ├─ config/                    # validate-env.ts
│  ├─ database/                  # Pool, UnitOfWork, migraciones externos
│  ├─ modules/
│  │  ├─ iam/                    # identidad y permisos
│  │  ├─ organizacion/
│  │  ├─ personal/
│  │  ├─ plantillas/
│  │  ├─ programacion/
│  │  ├─ asistencia/
│  │  ├─ incidencias/
│  │  ├─ movimientos-laborales/
│  │  ├─ eventuales/
│  │  ├─ cobertura/
│  │  ├─ demanda-asistencial/
│  │  ├─ balance/
│  │  ├─ reportes/
│  │  ├─ importacion/
│  │  ├─ notificaciones/
│  │  ├─ auditoria/
│  │  ├─ operaciones/
│  │  └─ documental/            # FUTURO, no construir antes de SQL V2/aprobación
│  └─ gateways/                  # si WS transversal; el resto en sus módulos
├─ test/                          # respetar runner existente
├─ docs/
│  ├─ casos-uso/                 # fichas + decisiones
│  ├─ api/                       # OpenAPI exportado, requests ejemplos
│  ├─ ui/                        # pantallas, estados, accesibilidad
│  ├─ arquitectura/              # ADRs, responsabilidades y eventos
│  ├─ pruebas/                   # evidencias reales, resultados de CI
│  └─ agentes/                   # bitácoras de tareas completadas
├─ db/
│  ├─ baseline/                  # copia de SQL V1 **solo referencia**
│  └─ migrations/                # SQL V2 incremental + checksums
├─ .env.example                   # sin credenciales válidas
└─ AGENTS.md                      # contrato operativo del agente
```

### Archivo por módulo (patrón estándar)

```text
src/modules/asistencia/
├─ asistencia.module.ts
├─ presentation/http/
│  ├─ asistencia.controller.ts
│  └─ dto/ (command.dto.ts, response.dto.ts, query.dto.ts)
├─ application/
│  ├─ commands/registrar-asistencia.use-case.ts
│  ├─ queries/listar-pase.use-case.ts
│  └─ ports/asistencia.repository.port.ts
├─ domain/
│  ├─ models/registro-asistencia.model.ts
│  ├─ policies/asistencia.policy.ts
│  └─ events/asistencia-registrada.event.ts
├─ infrastructure/postgres/asistencia.repository.pg.ts
├─ infrastructure/messaging/ (si necesita publicar)
└─ __tests__/ (unitarias y tests de política)
```

**Separación requerida:** `Controller` recibe HTTP; `DTO` valida frontera; `UseCase` orquesta transacción; `Model/Policy` expresa reglas; `Repository` encapsula SQL; `Gateway` publica cambios. El controller **no** ejecuta SQL. El model de dominio no depende de `@nestjs/common`, Angular ni Android. Ningún módulo escribe directamente tablas de otro módulo: orquestar mediante puertos/use cases internos.

## 3. Conectar NestJS con PostgreSQL ya importado

**Decisión recomendada:** empezar con el driver `pg` y SQL parametrizado + repositorios. Es una base SQL preexistente con exclusiones, triggers y FKs compuestas; usar `pg` evita que un ORM reescriba accidentalmente la estructura. Podrás valorar Prisma/TypeORM/Drizzle después, con migraciones controladas, pero **no** combinar sincronización automática y SQL maestro.

### Dependencias (ejecutar tras inspección de versiones)

```bash
npm i @nestjs/config @nestjs/swagger class-validator class-transformer pg helmet
npm i -D @types/pg
# Cuando implementes autenticación:
# npm i @nestjs/jwt @nestjs/passport passport passport-jwt argon2
# npm i -D @types/passport-jwt
# Cuando habilites WebSockets:
# npm i @nestjs/websockets @nestjs/platform-socket.io socket.io
```

Verifica compatibilidad con tu versión de Nest antes de instalar paquetes mayores y no sustituyas dependencias existentes sin necesidad.

`.env.example` (valores ficticios, **sin password real**):

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://sigeh_api:REEMPLAZAR_EN_ENTORNO_LOCAL@127.0.0.1:5432/sigeh_qa
CORS_ORIGINS=http://localhost:4200
SWAGGER_ENABLED=true
JWT_ISSUER=sigeh-local
JWT_AUDIENCE=sigeh-api
# JWT secretos/llaves: configurar en gestor seguro, no en Git ni en capturas
```

- Usar `sigeh_qa` para integración/desarrollo si existe; verificar qué BD está dentro de Docker.
- `DATABASE_URL` cambia a `@db:5432` **solo** si Nest y Postgres corren en misma red Compose y servicio se llama `db`.
- Crear un **rol SQL de aplicación con privilegios mínimos**, sin `SUPERUSER`, `CREATEDB` ni `BYPASSRLS`; implementar grants de acuerdo con matrices; no compartir contraseña en repositorio.
- SQL siempre parametrizado `$1`, `$2`; consultas calificadas `sigeh.empleados`, `sigeh.hospitales` para evitar errores de `search_path`.
- Cada transacción de caso de uso obtiene **un mismo `PoolClient`**, hace `BEGIN`, valida y muta en ese cliente, `COMMIT` o `ROLLBACK` y libera en `finally`. Nunca repartir una transacción entre consultas `pool.query()` independientes.

### Ejemplo mínimo del proveedor PostgreSQL

`src/database/database.module.ts`:

```ts
import { Global, Module, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => new Pool({
        connectionString: cfg.getOrThrow<string>('DATABASE_URL'),
        max: 10,
        application_name: 'sigeh-api',
      }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
```

**Nota:** el ejemplo importa símbolos que no se usan; limpiarlos en la implementación. Registrar un proveedor de ciclo de vida que llame `pool.end()` al cerrar Nest y manejar timeouts de conexión. Es un fragmento ilustrativo, no archivo completo compilado.

Ejemplo de transacción **sin datos reales**:

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const result = await client.query(
    'SELECT hospital_id, nombre FROM sigeh.hospitales WHERE hospital_id=$1',
    [hospitalId],
  );
  if (result.rowCount !== 1) throw new Error('No encontrado');
  // ... autorizar ámbito, ejecutar writes y registrar evento/outbox ...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

**Cuidado:** `rollback` debe registrarse incluso si la query falla y los errores SQL únicos/solapes (`23505`, `23P01`, `23503`) deben traducirse a errores de dominio/HTTP sin filtrar SQL interno. Para eventos WebSocket fiables: NO emitir antes de `COMMIT`.

### Prompt 02 — Conexión al esquema existente

> Inspecciona configuración real del repositorio y Docker. Instala solamente las dependencias compatibles faltantes. Implementa `DatabaseModule` con `pg` + `ConfigModule`, validación estricta de variables, cierre elegante del pool y `GET /api/v1/health` con SELECT 1 y conteo de tablas en esquema `sigeh` SOLO en ambiente de desarrollo. Nunca modifiques 51 tablas existentes ni actives `synchronize`. Crea `env.example`, `.env` ignorado y pruebas de error de conexión. Entrega archivos cambiados, comandos corridos, respuestas HTTP observadas y cualquier bloqueo; no declares la conexión exitosa sin ejecutarla.

## 4. Bootstrap API NestJS, Swagger y calidad mínima

### `src/main.ts` — configuración objetivo (adaptar a Nest/ESM del repositorio)

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = app.get(ConfigService);
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    forbidUnknownValues: true,
  }));
  app.enableCors({
    origin: (cfg.get<string>('CORS_ORIGINS') ?? '').split(',').filter(Boolean),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (cfg.get<string>('SWAGGER_ENABLED') === 'true' &&
      cfg.get<string>('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SIGE-H API')
      .setDescription('Sistema Integral de Gestión de Enfermería Hospitalaria')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
  await app.listen(Number(cfg.get<string>('PORT') ?? 3000));
}
bootstrap();
```

**Primera revisión Swagger**:

```bash
npm run start:dev
curl -i http://localhost:3000/api/v1/health
curl -fsS http://localhost:3000/docs/openapi.json | jq '.info.title, (.paths | keys)'
```

Documentación Swagger es **contrato y consola de exploración**, no sustituye tests automatizados. Para cada controller: `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth` (cuando aplique), `@ApiParam`, `@ApiQuery`, `@ApiBody`, `@ApiResponse` para `200/201/400/401/403/404/409/422`; DTOs con `@ApiProperty` y `class-validator`. Evitar ejemplos con nombres/RUD reales. No publicar `/docs` o `/docs/openapi.json` sin controles en producción.

**Primera entrega verificable:** aplicación arranca; Swagger presenta `/health`; API consulta BD sin escribir, un test E2E verifica conexión y otro comprueba retorno sanitizado cuando falta conexión; README indica comandos de host vs Docker.

### Prompt 03 — Swagger

> Sobre el NestJS existente, configura `api/v1`, DTO validation global, Swagger UI `/docs` y JSON `/docs/openapi.json` solo en entornos permitidos. Crea HealthModule y endpoint GET con respuestas Swagger 200/503; incluir prueba e2e. Verifica con `curl`, documenta salida y captura `docs/api/openapi.json` sin incluir secretos. No agregues CRUD ficticio ni rutas sin implementar.

## 5. Arquitectura: módulos, modelos, repositorios y tres clases de gateway

| Elemento | Propósito | Ejemplo SIGE-H | Prohibición |
|---|---|---|---|
| Módulo Nest (`@Module`) | Agrupa una responsabilidad | `AsistenciaModule` | no hacer consultas ajenas arbitrarias |
| Controller REST | Adapta HTTP | `POST /asistencias/...` | no SQL aquí |
| DTO | Valida frontera | `RegistrarPaseDto` | no es tabla |
| UseCase | Orquesta transacción y política | `ValidarAsistenciaUseCase` | no emitir socket antes de commit |
| Model de dominio | Estados/reglas independientes | `EstadoAsistencia` / `IntervaloLaboral` | no confundir modelo con ORM |
| `RepositoryPort` + Postgres adapter | Encapsula persistencia | `AsistenciaRepositoryPg` | no cambiar DDL desde código |
| WS Gateway (`@WebSocketGateway`) | Envía señales de refresh | `BalanceEventsGateway` | no tomar decisiones de asignación por socket |
| Gateway HTTP / reverse proxy | TLS, origen único, límites | Nginx/Caddy opcional en intranet | no requiere microservicios |
| Gateway de integración | Almacenamiento externo/notificación | `SecureFileStoragePort` | no conservar evidencia en storage público |

**Modelo de dominio mínimo compartido**: `HospitalScope` (hospital/división/servicio/subárea y vigencia), `LaborInterval` (UTC + timezone), `ProgramacionId`, `EmpleadoId`, `ContratacionVigente`, `CompetenciaVigente`, `MovimientoState`, `CoberturaState`. DTO y entidad SQL **pueden tener forma distinta**: adaptar explícitamente.

**Políticas de integración:** módulos publican interfaces de lectura o comandos de dominio; `CoberturaModule` pide disponibilidad al `EventualesModule`, elegibilidad a `PersonalModule`, jornada a `ProgramacionModule`, permisos a `IamModule`, todo orquestado en transacción cuando afecta datos. Si el repositorio conserva SQL crudo, declarar claramente qué módulo es dueño de cada tabla.

### Prompt 04 — Esqueleto modular, sin generar endpoints inventados

> Crea módulos Nest de organización, personal, programación, asistencia, incidencias, movimientos, eventuales, cobertura, balance, seguridad, demanda asistencial y auditoría como contenedores **vacíos o mínimos**; regístralos en AppModule. Genera estructura `presentation/application/domain/infrastructure` solo para el siguiente módulo a implementar, evitando 18 módulos vacíos gigantes. Define convenciones de naming, inyección de `RepositoryPort` mediante tokens y `docs/arquitectura/ADR-001-monolito-modular.md`. No implementar 271 endpoints simultáneamente. Compilar y ejecutar pruebas tras cada cambio.

## 6. Seguridad, identidad y ámbito multi-hospital (bloqueante para operaciones)

1. Antes de exponer datos personales, elegir autenticación: IdP/OIDC institucional si existe; de no existir, identidad propia con hashes robustos, JWT corto, refresh rotado y revocación. **La tabla `usuarios` V1 no tiene todo el modelo de sesiones/refresh**: diseñar migración V2 antes de fingirlo.
2. A partir de `usuario_roles`, obtener roles válidos **para momento y ámbito exactos**; un administrador de sistemas no tiene por defecto potestad clínica/jurídica.
3. Guardas en este orden conceptual: autenticado (`401`), permiso (deny by default), ámbito hospital/división/servicio, responsabilidad funcional, vigencia del rol/encargo, segregación de funciones y estado del recurso.
4. No confiar en `hospitalId`, `servicioId` o `userId` enviados por frontend; se validan frente a sesión/BD. Devolver `404` para recursos no visibles cuando proceda y `403` a acciones prohibidas.
5. Login y `GET /me`, `GET /me/alcances`, `GET /me/permisos`; no confiar en banderas de menú Angular como seguridad.
6. Registrar auditoría de **permitidos y denegados** sin poner PII en logs; limitar Swagger, rate-limit y proteger archivos PDF/datos laborales.
7. PostgreSQL: usar rol no superusuario; diseñar RLS por hospital como defensa extra después de resolver cómo fijar contexto transaccional (`SET LOCAL ...`) y de probar aislamiento. **No afirmar multi-hospital seguro solo por FK.**
8. En Android offline, permisos son snapshot con caducidad; si se revocan antes de reconexión, no aceptar decisiones realizadas sin autoridad vigente en servidor.

### Prompt 05 — Seguridad en dos pasos

> Implementa primero autenticación y `GET /me` utilizando solamente campos existentes; identifica la migración requerida para credenciales/sesiones y **no la ejecutes sin revisión**. Después añade `JwtAuthGuard`, `PermissionGuard`, `ScopeGuard`, decoradores declarativos y servicio `PolicyEngine`, con tests table-driven: jefe de servicio A no modifica B, supervisor división A no entra a B, encargado expirado es denegado, RRHH no autoriza cobertura, coordinador no altera clasificación pasada de incidencias. Prueba con sesiones de distintos roles (no con superusuario). Documenta Swagger 401/403 y evidencias de denegación.

## 7. Método exacto para desarrollar CADA caso de uso

No asignar a un agente "implementa el módulo completo" sin acotar. Tomar **un CU o una vertical pequeña** de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y elaborar un expediente antes del código. Archivo: `docs/casos-uso/<CU-ID>.md`.

### Plantilla obligatoria por CU

```md
# CU-ASI-XX — Nombre concreto
Estado: AC / PROP / FUT / BLOQUEADO_POR_DECISION
Prioridad: P0 / P1 / P2
Actor principal / actores secundarios: ...
Hospital, división, servicio y subárea afectados: ...
Fuentes: [fuente concreta y sección/tab], RF/RNF, regla RN
Objetivo / disparador / valor de negocio: ...
Precondiciones (sesión, rol, contrato, programación, ámbito): ...
Entrada validada y formato: ...
Flujo feliz numerado: ...
Alternativas: sin red, ausente, parcial, sustitución, festivo, permiso expirado, duplicado
Errores con códigos HTTP: 400/401/403/404/409/422
Postcondición + evento histórico + transacción: ...
Tablas y columnas REALES de SQL V1: ...
Brecha V2 si falta tabla/columna: ...
Endpoint método + path + Swagger operationId: ...
Request/Response con JSON ficticio: ...
Idempotencia / concurrencia / versión: ...
Pantalla Angular: ruta, formulario, loading, empty, conflict, success, forbidden
Pantalla Android: navigation route, ViewModel, cache, outbox, UI offline
Eventos WebSocket / rooms / carga sin PII: ...
Given/When/Then: al menos feliz, error de alcance, duplicado, estado, concurrencia
Evidencia: test unit, e2e, curl, Swagger JSON, screenshots ficticios
Decisión humana pendiente: ...
```

### Microciclo de desarrollo por CU

1. Leer especificación y SQL y **localizar** tablas/estados, no adivinarlos.
2. Crear ficha CU + pruebas de aceptación antes de editar DDL.
3. Diseñar DTO request/query/response y `operationId` estable; usar status correctos.
4. Implementar policy + model + use case + repo parametrizado + transacción (si muta).
5. Publicar controller y decorar Swagger; probar `curl` sin token, fuera de ámbito, válido y duplicado.
6. Desarrollar Angular/Android en la capa que corresponda. **Nunca simular un endpoint real con mocks silenciosos.**
7. Si hay actualización en vivo, evento posterior al commit + refresh REST.
8. Prueba unitaria, de integración, concurrencia y aceptación de pantalla; revisar logs sin PII.
9. Registrar `CU → ruta → código → tablas → test → evidencia` en la matriz.
10. Hacer commit pequeño con ID CU y nota de decisiones, sin cambiar casos no asignados.

### Ejemplo completo: CU-PER-01 Alta de empleado

- Fuente: V1 `sigeh.empleados(empleado_id,rud,nombres,primer_apellido,segundo_apellido,activo,creado_en)`.
- Permiso: RRHH autorizado con ámbito aplicable; **el empleado es global pero alta por RRHH requiere definición de contexto organizacional**, validar si hospital debe consignarse en contrato concomitante (dos pasos o comando compuesto).
- Endpoint: `POST /api/v1/empleados`; request `{ "rud":"QA-0001", "nombres":"Ejemplo", "primerApellido":"Prueba" }`; respuesta `201 {"empleadoId":"<uuid>","rud":"QA-0001","activo":true}`.
- Si RUD duplicado → SQL `23505` -> `409 RUD_DUPLICADO`, no error 500.
- Si sin token → 401; rol no facultado → 403; campo extra `isAdmin` → 400 por whitelist.
- Swagger: `@ApiOperation({operationId:'crearEmpleado'})` + DTO `@IsString`, `@IsNotEmpty`, `@MaxLength`; `@ApiResponse` 201/400/401/403/409.
- Angular: `personal/empleados/nuevo`, búsqueda previa opcional por RUD, formulario con validación accesible, success con enlace a expediente, conflicto 409 que no borra entrada.
- Android: no es captura operativa móvil, solo lectura de directorio acotado si se aprueba; **no duplicar pantalla alta**.
- Prueba: `GET` de lectura después de POST, duplicado, límites, DB transaction rollback en QA.

### Prompt por cada CU — copiar, completar y pegar

> Implementa **solo** `CU-___` del archivo de especificación. Antes de escribir código genera `docs/casos-uso/CU-___.md` con actor, permisos, estados, tablas exactas, contrato Swagger, UI Angular/Android, alternativas y 5 pruebas Given/When/Then. Lee DDL real y declara toda brecha que requiera migración. Entrega un plan de archivos y luego implementa el slice vertical Nest `DTO → controller → use case → dominio → postgres repo → auditoría/evento`, con tests. Si no hay autoridad o estructura SQL para una operación, deja backlog explícito; no falsifiques lógica en memoria. Al terminar: build + tests + `curl`/Swagger, relación trazable CU/ruta y lista de archivos cambiados. No tocar otros CU.

## 8. Contrato REST transversal y Swagger como consola de pruebas

- Versionado `/api/v1`; resource IDs UUID; fechas calendario locales `YYYY-MM-DD`, intervalos ISO-8601 con offset (`timestamptz`). Las guardias 20:00–07:30 cruzan medianoche; no convertir fecha final al mismo día.
- DTO de comandos no acepta campos técnicos ajenos. Paginación consistente (`cursor`, `limit`, `sort`) y filtros: hospital/servicio/periodo/turno; el servidor siempre valida el ámbito autorizado.
- `POST` para comandos de estado (`/autorizar`, `/aplicar`, `/reclasificar`, `/cerrar`), no `PATCH estado="..."` genérico. Respuestas a comandos llevan identificador, estado actual, versión y links de lectura si hace falta.
- Concurrencia: `Idempotency-Key` para mutaciones reintentables, `If-Match`/version de recursos que cambian. **V1 no contiene una tabla global de claves idempotentes**: diseñar V2 antes de afirmar deduplicación garantizada.
- `200/201/204` éxito; `400` validación; `401` sin sesión; `403` sin permiso; `404` inexistente/invisible; `409` estado/solape/versión; `422` política institucional; `429` tasa; `503` servicio temporalmente indisponible.
- Formato de error recomendado: `{code,message,details,traceId,retryable}`; excluir queries SQL, credenciales, diagnósticos sensibles y datos de otros hospitales.
- Usar `@ApiTags('Asistencia')`, `@ApiBearerAuth()`, `@ApiOperation({summary, operationId})`, `@ApiParam`, `@ApiQuery`, `@ApiBody`, `@ApiResponse`; DTO Response tipado.
- Exportar `GET /docs/openapi.json`, verificar que **cada CU P0 implementado** tenga operación y respuestas pertinentes; almacenar `docs/api/openapi.json` como evidencia generada en CI. Swagger UI usa variables de servidor y token de una cuenta ficticia acotada de QA, nunca `postgres`.
- Una prueba manual reproducible por endpoint: autenticado éxito → body inválido → token ausente → permisos insuficientes → entidad de otro hospital → duplicado → reintento → estado prohibido; agregar prueba automatizada equivalente.

### Ejemplo Swagger documentado de transición

```ts
@ApiTags('Movimientos')
@ApiBearerAuth()
@Controller('movimientos')
export class MovimientosController {
  @Post(':id/autorizar')
  @ApiOperation({ summary: 'Autorizar movimiento laboral', operationId: 'autorizarMovimiento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Movimiento autorizado y auditado' })
  @ApiResponse({ status: 403, description: 'Actor o ámbito no autorizado' })
  @ApiResponse({ status: 409, description: 'Estado incompatible o versión antigua' })
  async autorizar(@Param('id', new ParseUUIDPipe()) id: string,
                 @Body() dto: AutorizarMovimientoDto) {
    return this.autorizarUseCase.execute({ movimientoId: id, ...dto });
  }
}
```

*El fragmento omite imports y propiedad inyectada deliberadamente; el agente debe completarlos y compilarlo. El actor responsable se obtiene del contexto autenticado, NO del body.*

### Prompt 06 — Quality gate Swagger

> Para `CU-___`, confirma que el método y path coinciden con el inventario, que DTOs de entrada/salida se reflejan en `/docs/openapi.json`, que `operationId` es único y que Swagger muestra 200/201, 400, 401, 403, 409 según corresponda. Ejecuta requests con usuario QA: éxito, sin token, hospital ajeno, reintento, versión vieja; agrega test e2e y actualiza `docs/pruebas/<CU>.md` con resultados REALES. No edites el OpenAPI JSON a mano: debe derivarse del controlador Nest.

## 9. Guías de implementación por módulo (18 dominios)

**Aplicar el microciclo de §7 a CADA `CU-*`**, usando el inventario de §17 como checklist y el documento de especificación anterior para leer las descripciones. Las rutas listadas a continuación son **propuestas**, no rutas ya existentes. Las secciones de un módulo señalan controles concretos para backend, interfaz web, móvil, Swagger y pruebas; el **prompt por módulo** se puede pegar al agente, pero siempre acotando una primera historia y sin crear los 20 endpoints en una sola operación.

**Prioridad de construcción técnica recomendada:** OPS/DB → IAM → ORG → PER → CAL/DOT → ASI → INC → MOV → EVE → COB → BAL → REP; módulos NOT/AUD transversales iterativos; MIG y ASI_CLIN por fases; DOC no iniciarlo hasta autorización institucional.

### 9.1 · IAM — Identidad, usuarios y permisos (16 casos)

- **Directorio Nest:** `src/modules/iam/`.
- **DDL V1 relevante:** `usuarios, roles, permisos, rol_permisos, usuario_roles`.
- **Dependencias:** DatabaseModule, PolicyEngine y catálogo de ámbitos.
- **Invariantes de dominio:** Roles por hospital/división/servicio y vigencia. Distinguir administrador técnico de autoridad operativa. JWT no confiere acceso sin control de ámbito del recurso. No usar token sin expiración.
- **Backend / use cases:** Comenzar con lectura de `roles`, `permisos` y `usuario_roles`; endpoints `/me`, `/me/alcances`; luego definir migración de identidad/sesiones necesaria y autenticación; guards declarativos, auditoría de denegaciones. Evitar hash en `usuarios` si no existe columna.
- **Interfaz Angular:** Login, selector de hospital si tiene más de uno, menú según permisos, administración de roles con vigencias y comparación de atribuciones. Nunca ofrecer acciones no permitidas como botones activos; protección real permanece en backend.
- **Interfaz Android Compose:** Pantalla login; selección de servicio/ámbito, caducidad de credenciales, bloqueo de acciones offline si el permiso ya caducó; no cachear tokens en preferencias no cifradas.
- **Pruebas de aceptación/seguridad:** 401 sin sesión, 403 hospital ajeno, rol expirado, escalamiento de privilegios, revocación en tiempo real, acceso a recurso de tercero por ID.
- **Bloqueo/gap:** Tabla `usuarios` y permiso V1 no son un proveedor completo de identidad; falta definir IdP, refresh y política RLS.
- **Primeras operaciones del inventario:** `CU-IAM-01` POST `/auth/login` (P0,AC); `CU-IAM-02` POST `/auth/refresh` (P0,AC); `CU-IAM-03` POST `/auth/logout` (P0,AC); `CU-IAM-04` GET `/auth/me` (P0,AC).

**Prompt de terminal para IAM**

> Lee los CUs `CU-IAM-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `usuarios, roles, permisos, rol_permisos, usuario_roles` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/iam/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Roles por hospital/división/servicio y vigencia. Distinguir administrador técnico de autoridad operativa. JWT no confiere acceso sin control de ámbito del recurso. No usar token sin expiración. Documenta el gap: Tabla `usuarios` y permiso V1 no son un proveedor completo de identidad; falta definir IdP, refresh y política RLS. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.2 · ORG — Hospitales, divisiones, servicios, subáreas (13 casos)

- **Directorio Nest:** `src/modules/organizacion/`.
- **DDL V1 relevante:** `hospitales, divisiones, servicios, subareas`.
- **Dependencias:** IAM: ScopeGuard; DatabaseModule.
- **Invariantes de dominio:** Jerarquía hospital→división→servicio→subárea opcional. Todos los hijos permanecen en hospital del padre. No cruzar personal/dotaciones de hospitales distintos.
- **Backend / use cases:** Listados jerárquicos filtrados, administración controlada por rol; usar FK compuesta real; inactivar sin borrar histórico. Optimizar GET hospital/división/servicio con índices existentes.
- **Interfaz Angular:** Configuración arbolada + tabla; breadcrumbs hospital/división/servicio; alta/inactivación con confirmación y aviso si hay dependencias.
- **Interfaz Android Compose:** Selector sólo de servicios autorizados; persistir último ámbito mientras token válido. Sin edición organizacional.
- **Pruebas de aceptación/seguridad:** Intentar insertar servicio con division de otro hospital, consultar subárea ajena, desactivar servicio con programación vigente.
- **Bloqueo/gap:** Autoridad orgánica e inactivación con dependencias necesitan reglas formales.
- **Primeras operaciones del inventario:** `CU-ORG-01` GET `/hospitales` (P0,AC); `CU-ORG-02` POST `/hospitales` (P1,PROP); `CU-ORG-03` PATCH `/hospitales/{hospitalId}` (P0,AC); `CU-ORG-04` GET `/hospitales/{hospitalId}/divisiones` (P0,AC).

**Prompt de terminal para ORG**

> Lee los CUs `CU-ORG-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `hospitales, divisiones, servicios, subareas` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/organizacion/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Jerarquía hospital→división→servicio→subárea opcional. Todos los hijos permanecen en hospital del padre. No cruzar personal/dotaciones de hospitales distintos. Documenta el gap: Autoridad orgánica e inactivación con dependencias necesitan reglas formales. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.3 · PER — Empleados, contratos, categorías y competencias (22 casos)

- **Directorio Nest:** `src/modules/personal/`.
- **DDL V1 relevante:** `empleados, contratos, categorias, funciones, competencias, adscripciones, empleado_funciones, empleado_competencias`.
- **Dependencias:** IAM, ORG.
- **Invariantes de dominio:** RUD único e inmutable; empleado único global; contrato por hospital, base/eventual; categoría nominal distinta de función y competencia verificada; vigencias y ceses históricos.
- **Backend / use cases:** Separar alta empleado de alta contrato/adscripción; transacciones para crear contrato y validación de hospital; búsqueda paginada sin filtrar datos de otros hospitales por RUD; evaluar elegibilidad por contrato+función+competencia+fecha.
- **Interfaz Angular:** Padrón con filtros RUD/categoría/contrato/servicio; ficha en pestañas Personal, Contratos, Adscripciones, Funciones, Competencias, Historial. Validadores y confirmaciones.
- **Interfaz Android Compose:** Ficha mínima de empleado programado por servicio con información indispensable; no exponer datos completos del expediente laboral.
- **Pruebas de aceptación/seguridad:** RUD duplicado, contrato fuera de vigencia, acceso a empleado por identificador cruzado, competencia vencida, categoría nominal no equivale a acreditación.
- **Bloqueo/gap:** Historial de categorías y almacenamiento de evidencia sensible requieren V2.
- **Primeras operaciones del inventario:** `CU-PER-01` POST `/empleados` (P0,AC); `CU-PER-02` GET `/empleados` (P0,AC); `CU-PER-03` GET `/empleados/{empleadoId}` (P0,AC); `CU-PER-04` PATCH `/empleados/{empleadoId}` (P0,AC).

**Prompt de terminal para PER**

> Lee los CUs `CU-PER-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `empleados, contratos, categorias, funciones, competencias, adscripciones, empleado_funciones, empleado_competencias` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/personal/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: RUD único e inmutable; empleado único global; contrato por hospital, base/eventual; categoría nominal distinta de función y competencia verificada; vigencias y ceses históricos. Documenta el gap: Historial de categorías y almacenamiento de evidencia sensible requieren V2. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.4 · DOT — Plantilla de servicio y rotaciones por subárea (12 casos)

- **Directorio Nest:** `src/modules/plantillas/`.
- **DDL V1 relevante:** `plantilla_servicio, rotaciones_subarea`.
- **Dependencias:** ORG, PER, CAL.
- **Invariantes de dominio:** La plantilla objetivo pertenece al servicio, nunca multiplicarla por cada subárea. Una rotación mensual modifica ubicación operativa, no plaza nominal.
- **Backend / use cases:** CRUD de objetivos vigentes con control de solape por servicio/categoría/turno; rotaciones mensuales derivadas de contrato y subárea; comparación plantilla RRHH vs Coordinación (lectura) con discrepancias justificadas.
- **Interfaz Angular:** Matriz de plantilla objetivo vs nominal/operativa por servicios, editor de rotaciones por mes y vista de diferencias/pendientes de RH.
- **Interfaz Android Compose:** Consulta del personal que corresponde al servicio/subárea del turno, no editor masivo de plantilla.
- **Pruebas de aceptación/seguridad:** Contar una sola vez al mismo empleado presente en servicio aunque cambie subárea, rotación de subárea de otro servicio, solapamiento mensual.
- **Bloqueo/gap:** Plaza vacante estructural necesita entidad propia/migración; no registrarla como falsa ausencia.
- **Primeras operaciones del inventario:** `CU-DOT-01` GET `/servicios/{servicioId}/plantilla` (P0,AC); `CU-DOT-02` POST `/servicios/{servicioId}/plantilla` (P0,AC); `CU-DOT-03` POST `/plantillas/{plantillaId}/versiones` (P1,PROP); `CU-DOT-04` GET `/servicios/{servicioId}/brecha-plantilla` (P0,PROP).

**Prompt de terminal para DOT**

> Lee los CUs `CU-DOT-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `plantilla_servicio, rotaciones_subarea` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/plantillas/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: La plantilla objetivo pertenece al servicio, nunca multiplicarla por cada subárea. Una rotación mensual modifica ubicación operativa, no plaza nominal. Documenta el gap: Plaza vacante estructural necesita entidad propia/migración; no registrarla como falsa ausencia. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.5 · CAL — Patrones laborales, guardias, festivos y programación (21 casos)

- **Directorio Nest:** `src/modules/programacion/`.
- **DDL V1 relevante:** `horarios, patrones_laborales, patron_dias, empleado_patrones, calendario_festivos, programacion_laboral`.
- **Dependencias:** ORG, PER, DOT.
- **Invariantes de dominio:** MAT 07:00–14:30; VESP 14:00–21:00; noche 20:00–07:30 siguiente día con tres guardias FIJAS por semana; JA 07–19/09–21. Descansos LM/MMi/MiJ/JV/VS/SD/DL. Festivo de eventual en descanso habitual conserva turno habitual. No auto-rotar guardias, no inferir falta en no programado.
- **Backend / use cases:** Implementar simulador puro que genera instantes con timezone por hospital, cruces de medianoche y excepciones; publicar períodos en transacción, deduplicar, validar contrato/patrón/descanso y aplicar exclusión para solapes; controles de patrones por vigencia.
- **Interfaz Angular:** Calendario mensual/semanal por servicio y empleado, indicador programado vs descanso vs festivo, asistente Simular/Validar/Publicar con comparación antes/después.
- **Interfaz Android Compose:** Agenda del turno/día + estado de publicación. No mostrar fechas no programadas como falta; ver actualización luego de convenio/cambio descanso.
- **Pruebas de aceptación/seguridad:** DL entre semanas, LMiV fijo, guardia que cruza día, los patrones administrativos con mismos días mantienen código, eventual festivo en turno habitual, inserción de dos jornadas solapadas.
- **Bloqueo/gap:** Generador de programación, publicación versionada y horas particulares exigen política de transiciones adicional; no asumir que todo trabajador de JA labora todos los festivos.
- **Primeras operaciones del inventario:** `CU-CAL-01` GET `/horarios` (P0,AC); `CU-CAL-02` POST `/horarios` (P1,AC); `CU-CAL-03` GET `/patrones-laborales` (P0,AC); `CU-CAL-04` POST `/patrones-laborales` (P1,AC).

**Prompt de terminal para CAL**

> Lee los CUs `CU-CAL-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `horarios, patrones_laborales, patron_dias, empleado_patrones, calendario_festivos, programacion_laboral` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/programacion/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: MAT 07:00–14:30; VESP 14:00–21:00; noche 20:00–07:30 siguiente día con tres guardias FIJAS por semana; JA 07–19/09–21. Descansos LM/MMi/MiJ/JV/VS/SD/DL. Festivo de eventual en descanso habitual conserva turno habitual. No auto-rotar guardias, no inferir falta en no programado. Documenta el gap: Generador de programación, publicación versionada y horas particulares exigen política de transiciones adicional; no asumir que todo trabajador de JA labora todos los festivos. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.6 · ASI — Pase de lista y estados de asistencia (15 casos)

- **Directorio Nest:** `src/modules/asistencia/`.
- **DDL V1 relevante:** `programacion_laboral, registros_asistencia, eventos_asistencia`.
- **Dependencias:** PER, CAL, IAM.
- **Invariantes de dominio:** PENDIENTE hasta validación; ausencia no surge automáticamente porque no se marcó A en hoja. Presencia en coordinación no equivale a incorporación. Corrección = nuevo evento, nunca UPDATE de histórico.
- **Backend / use cases:** Implementar GET pase lista por servicio, fecha y turno; PUT asistencia por jornada idempotente; evento historial; comando de validar con permiso distinto; GET discrepancias. Usar `programacion_id` UNIQUE y transacciones con bloqueos para concurrencia.
- **Interfaz Angular:** Panel pase de lista con estado Pendiente/Presente/Ausente/Parcial/No exigible, observaciones, validación por supervisión y auditoría de cambios. Bloquear cierre con pendientes o exigir política explícita.
- **Interfaz Android Compose:** Pantalla central Compose lista del personal programado, botones grandes Presente/Ausente/Parcial, motivo opcional, guardar offline en Room, iconos Pendiente local/Sincronizado/Conflicto; no inventar confirmación de servidor.
- **Pruebas de aceptación/seguridad:** Dos capturas en paralelo, lote repetido, revocación de rol offline, faltas no declaradas por celda vacía, horario sin programación, validación por usuario no autorizado.
- **Bloqueo/gap:** Falta tabla de lote/inbox para idempotencia offline y entidad de pase cerrado; diseñar V2 si el ciclo de lote no cabe en V1.
- **Primeras operaciones del inventario:** `CU-ASI-01` GET `/pases-lista` (P0,AC); `CU-ASI-02` PUT `/programaciones/{programacionId}/asistencia` (P0,AC); `CU-ASI-03` POST `/asistencias/lotes` (P0,PROP); `CU-ASI-04` POST `/asistencias/{asistenciaId}/eventos` (P0,AC).

**Prompt de terminal para ASI**

> Lee los CUs `CU-ASI-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `programacion_laboral, registros_asistencia, eventos_asistencia` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/asistencia/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: PENDIENTE hasta validación; ausencia no surge automáticamente porque no se marcó A en hoja. Presencia en coordinación no equivale a incorporación. Corrección = nuevo evento, nunca UPDATE de histórico. Documenta el gap: Falta tabla de lote/inbox para idempotencia offline y entidad de pase cerrado; diseñar V2 si el ciclo de lote no cabe en V1. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.7 · INC — Calendario de incidencias y reclasificación (18 casos)

- **Directorio Nest:** `src/modules/incidencias/`.
- **DDL V1 relevante:** `tipos_incidencia, incidencias, incidencia_jornadas, incidencia_versiones, incidencia_autorizaciones, incidencia_documentos`.
- **Dependencias:** PER, CAL, ASI, IAM.
- **Invariantes de dominio:** Asistencia operativa separada de clasificación administrativa. Retrasificación aprobada no sobrescribe hechos ni coberturas. Catálogo extensible; faltas, vacaciones, licencias, incapacidad y pases parciales no son misma cosa.
- **Backend / use cases:** CRUD de incidencia con periodos, vincular jornadas, decisiones por autoridad, versionado append-only, adjuntos mediante storage seguro y hashes; evitar acceso a justificación fuera de su ámbito.
- **Interfaz Angular:** Calendario mes/día con filtros por servicio/tipo/estado, panel de incidencia y línea temporal operativa vs administrativa; aprobaciones por rol y conciliación posterior al cierre.
- **Interfaz Android Compose:** Capturar incidencia ligada a jornada, mostrar estado y evidencia mínima, cola offline sólo para registro preliminar, sin autorizar retrospectivamente offline.
- **Pruebas de aceptación/seguridad:** Licencia posterior cambia clasificación administrativa sin alterar `cierres_balance`; actor no autorizado no reclasifica; incidencia de otro hospital rechazada; periodos parciales válidos.
- **Bloqueo/gap:** Versión automática de cada edición y autorización documental necesitan orquestación y quizá V2.
- **Primeras operaciones del inventario:** `CU-INC-01` GET `/tipos-incidencia` (P0,AC); `CU-INC-02` POST `/tipos-incidencia` (P1,AC); `CU-INC-03` POST `/incidencias` (P0,AC); `CU-INC-04` GET `/incidencias` (P0,AC).

**Prompt de terminal para INC**

> Lee los CUs `CU-INC-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `tipos_incidencia, incidencias, incidencia_jornadas, incidencia_versiones, incidencia_autorizaciones, incidencia_documentos` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/incidencias/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Asistencia operativa separada de clasificación administrativa. Retrasificación aprobada no sobrescribe hechos ni coberturas. Catálogo extensible; faltas, vacaciones, licencias, incapacidad y pases parciales no son misma cosa. Documenta el gap: Versión automática de cada edición y autorización documental necesitan orquestación y quizá V2. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.8 · MOV — Convenios, cambios de descanso y pases de salida (20 casos)

- **Directorio Nest:** `src/modules/movimientos-laborales/`.
- **DDL V1 relevante:** `movimientos_laborales, movimiento_decisiones, movimiento_eventos, convenios_sustitucion, cambios_descanso, pases_salida, efectos_programacion_movimiento`.
- **Dependencias:** CAL, PER, IAM, ASI.
- **Invariantes de dominio:** Convenio = sustitución NO recíproca; sustituto acepta + autoridad aprueba; no doble conteo. Cambio ocasional no altera patrón; pase autorizado puede no ejecutarse y puede cerrar sin regreso documentado, sin inventar hora.
- **Backend / use cases:** Comandos solicitar, aceptar, autorizar, aplicar, revocar; transacción atómica con efectos/programaciones; clases de estado y policy por tipo. Controlar no duplica cobertura si convenio ya sustituyó.
- **Interfaz Angular:** Bandeja de solicitudes con tipo/estado, formularios por tipo, vista de calendario antes/después, línea de tiempo de decisiones, aprobación separada y estado del pase.
- **Interfaz Android Compose:** Solicitar pase/consultar convenio; registrar hora real de salida, opcional regreso, indicador No verificado; posible aceptación del sustituto; no exponer acciones de aprobación sin facultad.
- **Pruebas de aceptación/seguridad:** Convenio sin reciprocidad, sustituto con jornada solapada, aplicación repetida, cambio de descanso mismo día ocupado, pase sin regreso, regreso anterior a salida.
- **Bloqueo/gap:** Autorización completa por ámbito y atomicidad de aplicación requieren use cases; estados V1 con reglas pendientes de validar.
- **Primeras operaciones del inventario:** `CU-MOV-01` POST `/movimientos/convenios` (P0,AC); `CU-MOV-02` POST `/movimientos/{movimientoId}/aceptar` (P0,PROP); `CU-MOV-03` GET `/movimientos/{movimientoId}` (P0,AC); `CU-MOV-04` POST `/movimientos/{movimientoId}/validar-convenio` (P0,PROP).

**Prompt de terminal para MOV**

> Lee los CUs `CU-MOV-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `movimientos_laborales, movimiento_decisiones, movimiento_eventos, convenios_sustitucion, cambios_descanso, pases_salida, efectos_programacion_movimiento` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/movimientos-laborales/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Convenio = sustitución NO recíproca; sustituto acepta + autoridad aprueba; no doble conteo. Cambio ocasional no altera patrón; pase autorizado puede no ejecutarse y puede cerrar sin regreso documentado, sin inventar hora. Documenta el gap: Autorización completa por ámbito y atomicidad de aplicación requieren use cases; estados V1 con reglas pendientes de validar. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.9 · EVE — Reserva, preasignaciones y disponibilidad eventual (12 casos)

- **Directorio Nest:** `src/modules/eventuales/`.
- **DDL V1 relevante:** `disponibilidad_eventual, contratos, asignaciones_operativas`.
- **Dependencias:** PER, CAL, IAM, COB.
- **Invariantes de dominio:** Modelo mixto: preasignación para faltas previstas y reserva presente en Coordinación. Declarada ≠ presencia validada ≠ asignación ≠ incorporación. No asumir que eventual siempre cubre todos los festivos.
- **Backend / use cases:** Registrar disponibilidad con inicio/fin; validar llegada a coordinación con actor y hora; listar candidatos elegibles con competencias/intervalos; crear reserva sin declararla cubierta.
- **Interfaz Angular:** Tablero de reserva por turno, disponibilidad con filtro de perfil/servicio, cronología de llegada, preasignados vs libres, estados y alertas.
- **Interfaz Android Compose:** Ficha del eventual/consulta de asignación y confirmación operativa por autoridad; ubicación GPS no requerida; no activar auto-presencia desde smartphone.
- **Pruebas de aceptación/seguridad:** Persona solo declarada no asignable como presencia física verificada cuando se requiere; contrato no vigente; doble reserva incompatibles; ausencia de prueba de incorporación.
- **Bloqueo/gap:** Proceso oficial de confirmación de llegada a coordinación y vínculo previo necesidad/asignación todavía requiere decisión/migración V2.
- **Primeras operaciones del inventario:** `CU-EVE-01` GET `/eventuales` (P0,AC); `CU-EVE-02` POST `/eventuales/disponibilidades` (P0,AC); `CU-EVE-03` POST `/eventuales/disponibilidades/{disponibilidadId}/validar-presencia` (P0,AC); `CU-EVE-04` POST `/eventuales/disponibilidades/{disponibilidadId}/finalizar` (P0,AC).

**Prompt de terminal para EVE**

> Lee los CUs `CU-EVE-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `disponibilidad_eventual, contratos, asignaciones_operativas` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/eventuales/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Modelo mixto: preasignación para faltas previstas y reserva presente en Coordinación. Declarada ≠ presencia validada ≠ asignación ≠ incorporación. No asumir que eventual siempre cubre todos los festivos. Documenta el gap: Proceso oficial de confirmación de llegada a coordinación y vínculo previo necesidad/asignación todavía requiere decisión/migración V2. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.10 · COB — Necesidades, asignaciones, incorporaciones y cobertura real (24 casos)

- **Directorio Nest:** `src/modules/cobertura/`.
- **DDL V1 relevante:** `necesidades_cobertura, necesidad_competencias, asignaciones_operativas, incorporaciones_servicio, aplicaciones_cobertura, movimientos_operativos`.
- **Dependencias:** ORG, PER, CAL, ASI, INC, MOV, EVE, IAM.
- **Invariantes de dominio:** Falta no crea cobertura por sí sola; necesidad por intervalo/servicio/competencia. Asignado ≠ incorporado ≠ cubierto. No exceder cantidad requerida, no doble contar eventual ni traslado; hay que evaluar impacto en origen.
- **Backend / use cases:** Endpoints necesidad detectar/validar, candidatos, preasignar, confirmar, incorporar, aplicar coberturas, redistribuir, cancelar. Locks `FOR UPDATE` y/o advisory locks por necesidad/empleado; recomputar remanente en transacción; prevenir doble confirmación; WS tras commit.
- **Interfaz Angular:** Tablero de semáforo por servicio, lista necesidad/candidatos, arrastrar-soltar SOLO como interfaz (envía comando POST), modal con decisión y conflictos, evidencia de recibo en servicio, parciales y no cubiertas.
- **Interfaz Android Compose:** Recepción de eventual en servicio por jefe, confirmación de inicio efectivo, rechazo motivado, vista asignación propia; no declarar cobertura por ver solo una tarjeta.
- **Pruebas de aceptación/seguridad:** Dos coordinadores asignan mismo eventual simultáneamente, necesidad 2/persona 1=parcial, cobertura fuera de incorporación, traslado genera déficit origen, ausencia sin déficit adicional.
- **Bloqueo/gap:** DDL V1 no impide todos los solapes de asignaciones ni exceso global de `aplicaciones_cobertura`; requerirá bloqueo transaccional + restricciones/migración V2.
- **Primeras operaciones del inventario:** `CU-COB-01` POST `/necesidades/evaluar` (P0,PROP); `CU-COB-02` POST `/necesidades-cobertura` (P0,AC); `CU-COB-03` GET `/necesidades-cobertura` (P0,AC); `CU-COB-04` GET `/necesidades-cobertura/{necesidadId}` (P0,AC).

**Prompt de terminal para COB**

> Lee los CUs `CU-COB-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `necesidades_cobertura, necesidad_competencias, asignaciones_operativas, incorporaciones_servicio, aplicaciones_cobertura, movimientos_operativos` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/cobertura/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Falta no crea cobertura por sí sola; necesidad por intervalo/servicio/competencia. Asignado ≠ incorporado ≠ cubierto. No exceder cantidad requerida, no doble contar eventual ni traslado; hay que evaluar impacto en origen. Documenta el gap: DDL V1 no impide todos los solapes de asignaciones ni exceso global de `aplicaciones_cobertura`; requerirá bloqueo transaccional + restricciones/migración V2. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.11 · ASI_CLIN — Ocupación, complejidad y hoja de enlace (15 casos)

- **Directorio Nest:** `src/modules/demanda-asistencial/`.
- **DDL V1 relevante:** `indicadores_complejidad, mediciones_complejidad`.
- **Dependencias:** ORG, IAM, COB, BAL.
- **Invariantes de dominio:** Datos agregados y fuentes documentadas; carga asistencial impacta necesidad sin imponerse ratio universal NOM-019. Censos y productividad son distintos de asistencia y no exponen identidad de paciente.
- **Backend / use cases:** CRUD seguro de indicadores/mediciones por intervalo y servicio, validación de rangos y unidades. Datos de camas, hemocomponentes, quirófanos/toco y CEyE requerirán extensión V2 de esquema.
- **Interfaz Angular:** Hoja de enlace estructurada por división/servicio/turno con camas autorizadas, reales, ocupación, graves, RCP, ventilación, alto flujo, CPAP/BiPAP y hemocomponentes; dashboard solo lectura de agregados autorizados.
- **Interfaz Android Compose:** Formulario de captura rápida agregada por turno con campos numéricos y notas; requiere aprobación de alcance para datos específicos.
- **Pruebas de aceptación/seguridad:** Ocupación no negativa, camas reales vs autorizadas se reportan ambas, prohibir datos identificatorios de pacientes en JSON libre, respaldo de medición fuente.
- **Bloqueo/gap:** `mediciones_complejidad` no modela aún todo censo/productividad; módulo de enlace completo es FUT y necesita V2/aprobación.
- **Primeras operaciones del inventario:** `CU-ASI_CLIN-01` GET `/indicadores-complejidad` (P0,AC); `CU-ASI_CLIN-02` POST `/indicadores-complejidad` (P1,AC); `CU-ASI_CLIN-03` POST `/mediciones-complejidad` (P0,AC); `CU-ASI_CLIN-04` GET `/mediciones-complejidad` (P0,AC).

**Prompt de terminal para ASI_CLIN**

> Lee los CUs `CU-ASI_CLIN-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `indicadores_complejidad, mediciones_complejidad` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/demanda-asistencial/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Datos agregados y fuentes documentadas; carga asistencial impacta necesidad sin imponerse ratio universal NOM-019. Censos y productividad son distintos de asistencia y no exponen identidad de paciente. Documenta el gap: `mediciones_complejidad` no modela aún todo censo/productividad; módulo de enlace completo es FUT y necesita V2/aprobación. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.12 · BAL — Balance diario, cierres y conciliación retroactiva (18 casos)

- **Directorio Nest:** `src/modules/balance/`.
- **DDL V1 relevante:** `cierres_balance, registros_asistencia, incidencias, aplicaciones_cobertura, movimientos_laborales`.
- **Dependencias:** DOT, CAL, ASI, INC, MOV, EVE, COB, IAM.
- **Invariantes de dominio:** Balance por servicio/turno/intervalo, sin doble conteo subáreas, vacaciones ≠ vacantes, asignado ≠ incorporado. Snapshot cerrado es inmutable y reclasificación solo cambia conciliación.
- **Backend / use cases:** Read model por intervalos homogéneos; consultas explícitas de programado, exigible, presente validado, ausente, cubierto, redistribuido, no cubierto; validar fórmulas/denominadores; cierre versionado con JSONB y autor, PDF con hash.
- **Interfaz Angular:** Matriz día/turno/servicio, filas parecidas al balance heredado pero con estado por separado y responsable, diferencias reales vs programadas, semáforo y acciones emitir/rectificar; exportar PDF bajo rol.
- **Interfaz Android Compose:** Resumen del pase enviado, discrepancias y estado de validación; lectura de balance acotado de su servicio. No edición del cierre.
- **Pruebas de aceptación/seguridad:** Reclaseficiar no cambia JSONB histórico; cubierta + remanente = necesidad por perfil/intervalo; reposo no es falta; PDF mismo cierre/versión genera mismo contenido lógico.
- **Bloqueo/gap:** Ratios, tasas y denominadores heredados requieren decisión explícita y test de regresión; motor SQL reportes aún no existe.
- **Primeras operaciones del inventario:** `CU-BAL-01` GET `/balances/diarios` (P0,PROP); `CU-BAL-02` GET `/balances/diarios/{servicioId}/detalle` (P0,PROP); `CU-BAL-03` POST `/balances/simular-cierre` (P0,PROP); `CU-BAL-04` POST `/balances/cierres` (P0,AC).

**Prompt de terminal para BAL**

> Lee los CUs `CU-BAL-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `cierres_balance, registros_asistencia, incidencias, aplicaciones_cobertura, movimientos_laborales` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/balance/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Balance por servicio/turno/intervalo, sin doble conteo subáreas, vacaciones ≠ vacantes, asignado ≠ incorporado. Snapshot cerrado es inmutable y reclasificación solo cambia conciliación. Documenta el gap: Ratios, tasas y denominadores heredados requieren decisión explícita y test de regresión; motor SQL reportes aún no existe. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.13 · DOC — Oficios, actas y hallazgos de supervisión (futuro) (17 casos)

- **Directorio Nest:** `src/modules/documental/`.
- **DDL V1 relevante:** `NINGUNA tabla especializada en SQL V1`.
- **Dependencias:** IAM, INC, AUD, StorageGateway.
- **Invariantes de dominio:** No automatizar sanción o despido ni puntuación disciplinaria; actas requieren procedencia, autorizaciones reales, derecho de revisión, folio, firma válida y resguardo legal. No subir notas clínicas como evidencia sin fundamento y minimización.
- **Backend / use cases:** Antes de endpoint, acta de alcance y revisión Jurídico/RRHH; diseñar SQL V2 para expedientes, folios, documentos, participantes, evidencias, estados, revisiones/cancelaciones; API borrador/emitir/fe-de-erratas/acuse solo tras aprobación.
- **Interfaz Angular:** Plantilla de documento con campos guiados, adjuntos protegidos, validación jurídica, seguimiento de folio, acuses y acceso restringido por rol.
- **Interfaz Android Compose:** Acuse y lectura restringida solo si se aprueba; no firma legal simulada ni foto de evidencia sin procedimiento.
- **Pruebas de aceptación/seguridad:** Folio no reutilizable, rectificación versionada, acceso restringido, retención y cadena de custodia, ausencia de sanción automática.
- **Bloqueo/gap:** FUTURO y bloqueado: falta aprobación institucional y modelo físico.
- **Primeras operaciones del inventario:** `CU-DOC-01` GET `/documentos/tipos` (P2,FUT); `CU-DOC-02` POST `/documentos/actas` (P2,FUT); `CU-DOC-03` GET `/documentos/actas` (P2,FUT); `CU-DOC-04` GET `/documentos/actas/{actaId}` (P2,FUT).

**Prompt de terminal para DOC**

> Lee los CUs `CU-DOC-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `NINGUNA tabla especializada en SQL V1` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/documental/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: No automatizar sanción o despido ni puntuación disciplinaria; actas requieren procedencia, autorizaciones reales, derecho de revisión, folio, firma válida y resguardo legal. No subir notas clínicas como evidencia sin fundamento y minimización. Documenta el gap: FUTURO y bloqueado: falta aprobación institucional y modelo físico. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.14 · REP — Informes, tableros, exportaciones (13 casos)

- **Directorio Nest:** `src/modules/reportes/`.
- **DDL V1 relevante:** `cierres_balance, auditoria_general y read models derivados`.
- **Dependencias:** BAL, COB, INC, ASI_CLIN, IAM.
- **Invariantes de dominio:** Cifras con denominador público en el reporte; fechas y turnos explícitos; reproducción por versión; no exponer PII innecesaria ni mezclar hospitales.
- **Backend / use cases:** Endpoints resumen mensual, productividad, cobertura, ausentismo, exportación PDF/CSV con filtros y huella. Generación asíncrona si pesada, control por ámbito y límites de intervalos.
- **Interfaz Angular:** Dashboard directivo con filtros de hospital, división, servicio, turno y fecha; KPIs tarjeta con definición, tendencias y drill-down con autorización.
- **Interfaz Android Compose:** Vistas de estado de cobertura de su ámbito si procede; no descargas masivas de personal por defecto.
- **Pruebas de aceptación/seguridad:** Resultados reproducibles, export scoped, KPI que no confunde tasa de falta con dotación nominal, reporte con datos sin cambios si cierre es histórico.
- **Bloqueo/gap:** Indicadores de productividad por especialidad requieren fuentes/migraciones validadas; no copiar fórmulas de hoja sin homologar.
- **Primeras operaciones del inventario:** `CU-REP-01` GET `/tableros/coordinacion` (P0,PROP); `CU-REP-02` GET `/tableros/jefatura` (P1,PROP); `CU-REP-03` GET `/tableros/supervision` (P0,PROP); `CU-REP-04` GET `/reportes/deficits` (P0,PROP).

**Prompt de terminal para REP**

> Lee los CUs `CU-REP-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `cierres_balance, auditoria_general y read models derivados` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/reportes/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Cifras con denominador público en el reporte; fechas y turnos explícitos; reproducción por versión; no exponer PII innecesaria ni mezclar hospitales. Documenta el gap: Indicadores de productividad por especialidad requieren fuentes/migraciones validadas; no copiar fórmulas de hoja sin homologar. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.15 · MIG — Importación/conciliación de datos Google Sheets / RH (13 casos)

- **Directorio Nest:** `src/modules/importacion/`.
- **DDL V1 relevante:** `empleados, contratos, adscripciones, plantilla_servicio, programacion_laboral más staging V2`.
- **Dependencias:** ORG, PER, DOT, CAL, IAM.
- **Invariantes de dominio:** Fuente/hospital/día de corte identificados, hash por lote, vista previa y decisión autorizada; reimportar no duplica. Nunca mezcla Fray Antonio Alcalde con Juan I. Menchaca.
- **Backend / use cases:** Adapter lectura con autorización, parse/normalización, staging, errores, mapeo códigos, preview diff, commit transaccional por lote y rollback/reporte. No conexión de app a Drive del usuario sin OAuth institucional formal.
- **Interfaz Angular:** Wizard de importación: fuente/ámbito, columnas y mapa, previsualización de conflictos, aprobación y reporte final con filas válidas/rechazadas.
- **Interfaz Android Compose:** No desarrollar importación móvil.
- **Pruebas de aceptación/seguridad:** Reimportar lote idéntico, RUD duplicado entre archivos, horario particular, código de subárea ambiguo, hospital incorrecto, ninguna fila aplicada sin aprobación.
- **Bloqueo/gap:** Faltan tablas `importacion_lotes`, `importacion_filas`/mapeos/errores V2; el sistema no debe leer hojas de Drive desde producción sin permisos explícitos.
- **Primeras operaciones del inventario:** `CU-MIG-01` POST `/migraciones/fuentes` (P1,FUT); `CU-MIG-02` POST `/migraciones/lotes` (P0,FUT); `CU-MIG-03` GET `/migraciones/lotes/{loteId}/mapeo` (P0,FUT); `CU-MIG-04` PUT `/migraciones/lotes/{loteId}/mapeo` (P0,FUT).

**Prompt de terminal para MIG**

> Lee los CUs `CU-MIG-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `empleados, contratos, adscripciones, plantilla_servicio, programacion_laboral más staging V2` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/importacion/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Fuente/hospital/día de corte identificados, hash por lote, vista previa y decisión autorizada; reimportar no duplica. Nunca mezcla Fray Antonio Alcalde con Juan I. Menchaca. Documenta el gap: Faltan tablas `importacion_lotes`, `importacion_filas`/mapeos/errores V2; el sistema no debe leer hojas de Drive desde producción sin permisos explícitos. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.16 · NOT — Alertas y eventos en tiempo real (6 casos)

- **Directorio Nest:** `src/modules/notificaciones/`.
- **DDL V1 relevante:** `movimiento_eventos, auditoria_general, tabla outbox V2`.
- **Dependencias:** IAM, BAL, COB, ASI, MOV.
- **Invariantes de dominio:** WS es solo señal de actualización después del COMMIT, no motor de decisiones. Salas por ámbito verificadas en servidor. No enviar RUD, narrativas ni PII por socket.
- **Backend / use cases:** Implementar `@WebSocketGateway({ namespace: "/live" })` y autenticación de handshake + revalidación al unirse a room; publisher después de commit, outbox V2 para entrega confiable y replay por versión.
- **Interfaz Angular:** Servicio Socket.IO con reconexión que invalida queries REST/cache, mensajes de cambios de cobertura, incidental/conflicto y badge de conexión.
- **Interfaz Android Compose:** Solo eventos cuando app online; al recuperar red ejecutar sync/GET de snapshot en vez de confiar en mensajes perdidos.
- **Pruebas de aceptación/seguridad:** No recibir eventos hospital ajeno, sin token no conecta, mensaje no se emite por rollback, reconexión reconstruye estado, event order y deduplicación.
- **Bloqueo/gap:** Outbox/notifications persistentes no existen en V1; requiere V2 para robustez.
- **Primeras operaciones del inventario:** `CU-NOT-01` GET `/notificaciones` (P1,FUT); `CU-NOT-02` POST `/notificaciones/{notificacionId}/leer` (P1,FUT); `CU-NOT-03` PUT `/notificaciones/preferencias` (P2,FUT); `CU-NOT-04` POST `/notificaciones/dispositivos` (P1,FUT).

**Prompt de terminal para NOT**

> Lee los CUs `CU-NOT-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `movimiento_eventos, auditoria_general, tabla outbox V2` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/notificaciones/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: WS es solo señal de actualización después del COMMIT, no motor de decisiones. Salas por ámbito verificadas en servidor. No enviar RUD, narrativas ni PII por socket. Documenta el gap: Outbox/notifications persistentes no existen en V1; requiere V2 para robustez. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.17 · AUD — Auditoría de acciones y accesos (8 casos)

- **Directorio Nest:** `src/modules/auditoria/`.
- **DDL V1 relevante:** `auditoria_general, movimiento_eventos, eventos_asistencia, incidencia_versiones, cierres_balance`.
- **Dependencias:** IAM, todos los módulos.
- **Invariantes de dominio:** Eventos históricos inmutables; cambios administrativos por nueva versión, sin sobrescritura. Auditoría no filtra PII entre hospitales y no registra secrets.
- **Backend / use cases:** Middleware `X-Request-Id`, actor autenticado, agregación de auditoría por módulo con tabla existente; log de intentos denegados fuera del flujo de negocio; viewer paginado y restringido.
- **Interfaz Angular:** Visor de auditoría por entidad, fecha, usuario/acción y diff filtrado; solo auditor autorizado; enlaces a versiones y cierres.
- **Interfaz Android Compose:** Indicadores de estado de sincronización y historial propio; sin acceso completo a auditoría.
- **Pruebas de aceptación/seguridad:** Intento DELETE eventos asistencia rechazado, no UPDATE cierres, auditor ajeno no lee, no contraseñas ni JWT en logs.
- **Bloqueo/gap:** Auditoría V1 necesita política de retención, acceso y generación consistente desde cada use case; logs de denegados pueden requerir canal separado.
- **Primeras operaciones del inventario:** `CU-AUD-01` GET `/auditorias` (P0,AC); `CU-AUD-02` GET `/auditorias/entidades/{tipo}/{id}` (P0,PROP); `CU-AUD-03` GET `/auditorias/decisiones` (P0,PROP); `CU-AUD-04` POST `/auditorias/exportaciones` (P1,PROP).

**Prompt de terminal para AUD**

> Lee los CUs `CU-AUD-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `auditoria_general, movimiento_eventos, eventos_asistencia, incidencia_versiones, cierres_balance` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/auditoria/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Eventos históricos inmutables; cambios administrativos por nueva versión, sin sobrescritura. Auditoría no filtra PII entre hospitales y no registra secrets. Documenta el gap: Auditoría V1 necesita política de retención, acceso y generación consistente desde cada use case; logs de denegados pueden requerir canal separado. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

### 9.18 · OPS — Salud técnica, sincronización y despliegue (8 casos)

- **Directorio Nest:** `src/modules/operaciones/`.
- **DDL V1 relevante:** `sin tabla propia obligatoria; inbox/idempotencia/sync V2`.
- **Dependencias:** DatabaseModule, IAM, observabilidad.
- **Invariantes de dominio:** Health sin secretos; sincronización móvil idempotente; sin migraciones automáticas al levantar contenedor; readiness depende de BD; observabilidad y backups.
- **Backend / use cases:** GET health/live y health/ready, sync lotes por item, rate limiting, métricas, logs estructurados, backup/restore probados; reverse proxy e intranet; control acceso docs.
- **Interfaz Angular:** Página de estado/errores de sincronización solo para soporte, dashboard de tareas fallidas, historial de deploy sin datos personales.
- **Interfaz Android Compose:** Room + WorkManager; cola de cambios con clientEventId y versión, barra sincronización y resolución de conflictos por elemento; token vencido detiene sincronización y pide re-login.
- **Pruebas de aceptación/seguridad:** Pérdida red, 30 eventos reintentados sin duplicación, DB caída -> 503, reinicio y replay, límite tamaños de lote y acceso a docs.
- **Bloqueo/gap:** Falta modelo SQL de inbox/idempotencia, jobs y outbox. Despliegue TI intranet debe validarse.
- **Primeras operaciones del inventario:** `CU-OPS-01` GET `/health/live` (P0,PROP); `CU-OPS-02` GET `/health/ready` (P0,PROP); `CU-OPS-03` GET `/meta/version` (P0,PROP); `CU-OPS-04` POST `/sync/lotes` (P0,PROP).

**Prompt de terminal para OPS**

> Lee los CUs `CU-OPS-*` de `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` y las tablas `sin tabla propia obligatoria; inbox/idempotencia/sync V2` en el SQL maestro. Antes de programar elige el primer CU P0 implementable **sin migración V2** y crea su ficha según §7. Dentro de `src/modules/operaciones/` implementa DTO + Swagger, policy ámbito/rol, use case, modelo, repo `pg`, unit/e2e y la interfaz web o móvil pertinente. Restricción crítica: Health sin secretos; sincronización móvil idempotente; sin migraciones automáticas al levantar contenedor; readiness depende de BD; observabilidad y backups. Documenta el gap: Falta modelo SQL de inbox/idempotencia, jobs y outbox. Despliegue TI intranet debe validarse. Al terminar, registra pruebas reales y rutas implementadas, sin afirmar que el resto de casos funciona.

## 10. Guía de interfaces Angular: pantallas que consumen endpoints

El panel de Coordinación/Jefaturas es **Angular** (versión concreta a definir por `ng version`; no imponer una versión arbitraria). Estructura sugerida **en un proyecto Angular separado existente o nuevo, no dentro de `src/` de Nest**:

```text
web/src/app/
├─ core/
│  ├─ auth/ (auth.service.ts, auth.guard.ts, scope.service.ts)
│  ├─ api/ (api-client.ts, error-normalizer.ts, interceptors)
│  ├─ realtime/ (socket.service.ts, refresh-observer.ts)
│  └─ layout/ (nav, breadcrumbs, selector de hospital)
├─ features/
│  ├─ personal/ (list, detail, form, contrataciones)
│  ├─ programacion/ (calendar, simulation, publish)
│  ├─ asistencia/ (pase, review)
│  ├─ incidencias/ (calendar, detail, revisions)
│  ├─ movimientos/ (requests, approve, timeline)
│  ├─ eventuales/ (reserve, preassign)
│  ├─ cobertura/ (matrix, candidates, assignments)
│  ├─ balance/ (daily, monthly, snapshot)
│  └─ reportes/ (kpis, export)
└─ shared/ (table, empty-state, error-state, date-time-range, scope-chip)
```

**Contrato de UI común para CADA pantalla:** lista de campos (nombre, validación, origen), filtro de hospital/servicio/turno, columnas, orden, empty state, loading/skeleton, sin permisos, conflicto `409`, red caída, confirmación y reconexión. Toda acción usa cliente HTTP tipado **generado desde OpenAPI** o adaptador mantenido con test de contrato; no construir URLs en cada componente. Con `HttpInterceptor`: token, `X-Request-Id`, refresh coordinado seguro; `Idempotency-Key` en comandos reintentables. Generar tipos desde `docs/api/openapi.json` cuando exista export válido. No se muestra éxito antes de recibir `2xx` verificable.

| Ruta web sugerida | Vista y acciones | Endpoint(s) prioritarios | Condiciones UX |
|---|---|---|---|
| `/login` | Inicio y selección de hospital/servicio | `POST /auth/login`, `GET /me`, `/me/alcances` | En V1 la identidad puede requerir migración; 401 sin revelación de cuentas |
| `/organizacion` | Árbol hospital → división → servicio/subárea | `GET /hospitales`, `/divisiones`, `/servicios`, `/subareas` | solo ámbito permitido, filtros estables |
| `/personal` | Padrón con RUD/categoría, paginación | `GET /empleados` | sin divulgación cruzada, buscar por RUD sin exponer padrón entero |
| `/personal/:id` | Contratos, categorías, competencias, historial | `GET /empleados/:id`, ... | documentos/competencias por permiso |
| `/plantillas` | Objetivos vs adscripción y rotaciones | `GET /plantillas-servicio`, `/rotaciones-subarea` | no multiplicar conteo en subáreas |
| `/programacion` | Calendario y edición/simulación | `GET /programaciones`, `POST /programaciones/simular` | guardias cruzan medianoche, historia de patrón |
| `/pase-lista` | Grilla por servicio y turno para captura | `GET /pases-lista`, `PUT /programaciones/:id/asistencia` | pendiente ≠ falta, validaciones según rol |
| `/incidencias` | Calendario, filtros, detalle y reclasificaciones | `GET /incidencias`, `POST /incidencias/:id/reclasificaciones` | dos perspectivas histórico/administrativo |
| `/movimientos` | Bandeja convenios/descansos/pases | `GET /movimientos`, `POST /movimientos/:id/autorizar` | aprobación por rol; pase sin regreso explícito |
| `/eventuales` | Pool y preasignación | `GET /disponibilidad-eventual`, `GET /eventuales/candidatos` | separar presencia validada de propuesta |
| `/cobertura` | Matriz semáforo + asignación | `GET /necesidades-cobertura`, `POST /asignaciones-operativas` | drag-and-drop es UI, el servidor decide; `409` informa conflicto |
| `/incorporaciones` | Recepción real de personal | `POST /asignaciones/:id/incorporaciones` | recepción no automática por asignación |
| `/balances` | Balance día/turno y cierre | `GET /balances/diarios`, `POST /balances/cierres` | versión operativa y conciliada, PDF restringido |
| `/enlaces-turno` | Ocupación/complexidad agregada | `GET /enlaces-turno` (FUT) | antes de construir, migración y aprobación |
| `/reportes` | KPIs filtrados y export | `GET /balances/indicadores`, `/reportes/...` | fórmulas visibles, audiencia autorizada |
| `/auditoria` | Timeline inmutable / diff | `GET /auditoria` | solo auditoría, sin cambio histórico |

### Wireframe funcional de pantalla crítica: pase de lista

- Encabezado: hospital, división, servicio, subárea opcional, fecha, turno, `versionPublicada`, usuario y estado de conexión.
- Cuerpo: una fila por jornada **exigible** (RUD oculto o truncado según rol, nombre mínimo, categoría/función, horario, estado de asistencia, incidencia y observación). No mezclar vacantes sin persona en renglón de ausencia.
- Acciones: `Presente`, `Ausente`, `Parcial`, `Sin cambio`, `Guardar borrador`, `Enviar a validar` solo si permiso; tras capturar no saltar de `PENDIENTE` a `AUSENTE` por omisión de clic.
- Alertas: programación modificada, convenio autorizado, doble turno, horario fuera de patrón; conflictos `409` con comparación original/servidor y acción resolver.
- Pie: `programados`, `exigibles`, `capturados`, `pendientes`, `validados`; contador por *jornada*, no por celda de tabla.
- Responsive: tablets de piso, controles táctiles 44 px aprox, contraste, teclado, no usar color como único indicador.

### Wireframe funcional de pantalla crítica: cobertura

- Filtros arriba: fecha/turno/hospital/división/servicio; filtros quedan en URL para navegación reproducible.
- Columna izquierda: necesidades `IDENTIFICADA/VALIDADA/EN_ASIGNACION/PARCIAL/CUBIERTA/NO_CUBIERTA`, intervalo requerido, perfil, unidades, razón.
- Centro: candidatos disponibles con evidencia de presencia en coordinación, contrato, competencias verificadas, franja libre; candidato incompatible se marca como tal, no se permite forzar silencio.
- Derecha: asignaciones propuestas/confirmadas, incorporaciones y cobertura **efectiva**; mostrar remanente y de dónde sale.
- Al arrastrar una tarjeta de eventual: `POST` comando con `Idempotency-Key` y versión de necesidad. Mientras pending, mostrar "validando", **nunca inmediatamente "cubierto"**. Incorporación solo cuando servicio receptor la confirma.
- Socket: escuchar `necesidad.validada`, `asignacion.confirmada`, `incorporacion.confirmada`; invalidar cache y recargar por REST autorizado; si offline, bloquear nuevas asignaciones definitivas.

### Prompt 07 — generar Angular por pantalla

> Implementa únicamente pantalla Angular `[ruta]` vinculada al CU `[ID]`: consulta `docs/casos-uso/[ID].md` y OpenAPI real. Primero define navegación, formulario/columnas, validaciones, estados loading/empty/403/409/5xx, accesibilidad, comportamiento móvil responsive y permisos. Crea cliente tipado y un `facade` por feature. Prueba con servidor real en QA y mocks solo para tests Storybook/unit, rotulados. Conecta acciones REST y refresh tras eventos socket; no asumir resultados antes de HTTP 2xx. Entrega screenshot ficticio, pruebas de componentes y e2e del flujo.

## 11. Guía de interfaces Android Kotlin + Jetpack Compose

La app Android está orientada al **trabajo en piso y pasillos**: pase de lista, incidencias preliminares, consulta de programación, aceptación de convenio o incorporación si la autoridad lo permite. Stack propuesto: Compose + Navigation + ViewModel + StateFlow + Retrofit/OkHttp + Room + WorkManager + DI compatible con proyecto (por ejemplo Hilt) + almacenamiento cifrado de credenciales. No comenzar por sincronización bidireccional sin protocolo definido.

```text
mobile/app/src/main/java/.../
├─ core/network/ (Retrofit, AuthInterceptor, API error parser)
├─ core/auth/ (token/session, scope cache)
├─ core/database/ (Room: pase cacheado, cola local, sync metadata)
├─ core/sync/ (WorkManager, RetryPolicy, ConflictResolver)
├─ core/model/ (DTO/API vs entidad local)
├─ features/login/
├─ features/selector-ambito/
├─ features/agenda/
├─ features/pase-lista/
├─ features/incidencias/
├─ features/movimientos/
├─ features/incorporacion/
└─ features/estado-sincronizacion/
```

### Rutas/estados Compose por rol

| Pantalla móvil | Actores | Datos que consume | Acción y modo |
|---|---|---|---|
| Login y cambio de ámbito | todos | `GET /me`, alcances | ONLINE; refrescar tokens seguros |
| Mi turno / agenda | personal autorizado | `GET /programaciones` o propias | READ cache limitado |
| Pase lista | jefe/encargado | `GET /pases-lista` | CAPTURA OFFLINE PRELIMINAR, sync luego |
| Incidencia parcial/falta | jefe/encargado | `POST /asistencias/:id/eventos`, incidencias | cola offline validable, no autorización final |
| Detalle y acuse de convenio | sustituto | `/movimientos/...` | aceptar con servidor; offline solo borrador |
| Pase salida | jefe autorizado | `/movimientos`, `/pases-salida` | solicitar/registrar salida; regreso opcional |
| Recepción eventual | jefe receptor | `/asignaciones/:id/incorporaciones` | ONLINE para cobertura efectiva |
| Alertas/sync | todos | `POST /sincronizacion/asistencias`, `GET /sincronizacion/lotes/:id` | muestra errores por elemento |

### Room: entidades de la cola local propuestas (NO persistidas aún en PostgreSQL V1)

- `PendingCommand(clientEventId UUID, actorId, hospitalId, serviceId, programacionId, type, payloadJson, expectedVersion, createdAtDevice, status, attemptCount, lastErrorCode)`.
- `CachedProgramacion(programacionId, hospitalId, servicioId, startUtc, endUtc, version, fetchedAt, expiresAt)`.
- `SyncReceipt(clientEventId, serverEventId, appliedAtServer, responseCode)`.
- Estados UI: `PENDIENTE_LOCAL`, `ENVIANDO`, `APLICADO`, `YA_APLICADO`, `CONFLICTO`, `DENEGADO`, `REQUIERE_REVISION`, `ERROR_REINTENTABLE`.
- El identificador de comando local y `Idempotency-Key` deben permanecer **iguales en cada reintento**; no generar UUID nuevo al retransmitir.
- El servidor debe llevar **inbox/idempotencia persistida** antes de prometer exactamente una aplicación. `Room` solo protege la persistencia **local** y WorkManager puede ejecutar nuevamente.
- Conflictos: presentar estado local/servidor y pedir corrección autorizada. **No sobrescribir automáticamente** un reporte validado por sincronización tardía.
- Evitar cachear CURP, datos de incapacidad, notas clínicas, adjuntos legales; almacenar mínimo necesario, cifrado y con purga al cerrar sesión/expirar ámbito.
- Sin red: permitir captura preliminar si la política activa lo permite; impedir autorizaciones, asignaciones definitivas, cierres y documentos oficiales sin confirmación servidor.

### Prompt 08 — Android vertical

> Implementa `CU-ASI-01/02/03/13` en Compose con repository REST/Room y WorkManager, empezando por lectura de pase. Debe funcionar con móvil sin WiFi, persistir comandos locales con `clientEventId` fijo, mostrar estados local/sincronizado/conflicto, reintentar con backoff sin duplicar y detenerse ante 401/403 hasta reautenticación. Usa contrato OpenAPI del Nest real. Genera tests ViewModel/Room, integración con servidor QA y escenario de dos dispositivos en conflicto. No llames validación final a una captura offline.

## 12. Gateways, eventos y operaciones concurrentes

### 12.1 Gateway HTTP o BFF

Para inicio: **no crear un servicio separado**. NestJS sirve `/api/v1` y (cuando haya intranet) un reverse proxy gestiona HTTPS y restricciones. Angular y Android consumen el mismo OpenAPI; si se requieren respuestas distintas por cliente, agregar endpoint BFF interno limitado, no duplicar reglas de negocio.

### 12.2 Gateway WebSocket

Implementar en el momento que funcione al menos un caso REST. `@WebSocketGateway({ namespace: '/live' })`; autenticar JWT en handshake; derivar salas a partir del ScopeGuard/política, **no** permitir `join hospitalId` libre desde cliente. Tras `COMMIT`, publisher envía solo `{eventId,type,entityId,version,hospitalId,servicioId,occurredAt}` sin PII; pantalla ejecuta GET autorizado para estado nuevo. Reconexión = snapshot REST. Limitar tráfico/flood; no enviar secretos a salas.

```text
REST POST /api/v1/asignaciones-operativas
    -> validar scope + candidato
    -> BEGIN
    -> SELECT de necesidad y agenda FOR UPDATE
    -> insertar asignación propuesta + auditoría + outbox
    -> COMMIT
    -> publisher procesa outbox
    -> WS /live: asignacion.actualizada {id,version,scope}
    -> Angular: invalidar GET de matriz; Android: refresh si online
```

El SQL V1 **no contiene** `outbox_eventos`. Para garantizar entrega, añadir migración V2 revisada; mientras no exista, no anunciar confiabilidad de eventos tras reinicios. Un `server.emit` inmediato después del commit vale solo para prototipo, con limitación documentada.

### 12.3 Gateways de infraestructura / ports

```ts
export const COBERTURA_REPO = Symbol('COBERTURA_REPO');
export interface CoberturaRepositoryPort {
  getNeedForUpdate(client: PoolClient, necesidadId: string): Promise<NeedRecord | null>;
  listCoverage(client: PoolClient, necesidadId: string): Promise<CoverageRecord[]>;
  insertAssignment(client: PoolClient, input: AssignmentInput): Promise<AssignmentRecord>;
}
```

**Interfaces TS no son tokens de DI en runtime**: registrar `provide: COBERTURA_REPO, useClass: CoberturaRepositoryPg`, inyectar con `@Inject(COBERTURA_REPO)`. Los tipos/DTO ejemplo (`NeedRecord`, etc.) deben ser creados por el agente desde DDL. StorageGateway para PDFs/adjuntos con cifrado y URLs de corta vida, NotificationGateway para WS/alertas, ClockGateway para tests de tiempos.

### 12.4 Idempotencia y locks

| Riesgo | Control servidor mínimo | Prueba necesaria |
|---|---|---|
| Dos usuarios asignan mismo eventual | Transacción única, bloqueo candidato/intervalo, constraint/exclusión adicional según validación | 2 requests concurrentes, uno gana |
| Dos coordinadores consumen últimas unidades de necesidad | `SELECT ... FOR UPDATE` necesidad + recomputar suma de coberturas vigentes antes de confirmar | nunca superar `cantidad_requerida` |
| Cliente offline reenvía el mismo pase | inbox persistente `clientEventId+actor+payloadHash`, misma respuesta | una sola mutación histórica |
| Autorizar convenio dos veces | estado `AUTORIZADO`, versión, unique de efecto y audit | segunda aplicación no duplica jornada |
| Cerrar balance con cambios simultáneos | snapshot versionado consistente con watermark/lock o corte definible | cierre estable y conciliación posterior |
| Evento WS antes de rollback | outbox en misma transacción, worker posterior | rollback → cero evento |

**No dar por cubierta ninguna de estas filas solo porque pasaron pruebas 01 y 02:** la prueba 05 de concurrencia y la seguridad RLS/roles de aplicación no tienen resultados reportados en el contexto. `FOR UPDATE` es ejemplo y necesita diseño de orden de locks para evitar deadlocks; documentar timeouts y reintentos de serialización seguros.

### Prompt 09 — Concurrencia y gateway

> Para `CU-COB-...` implementa comando transaccional con lock estable, idempotencia y postcondición de no doble asignación. Usa la estructura real `sigeh.necesidades_cobertura`, `sigeh.asignaciones_operativas`, `sigeh.incorporaciones_servicio`, `sigeh.aplicaciones_cobertura`. Diseña primero prueba con dos transacciones que compiten sobre mismo eventual/necesidad; exige una sola cobertura válida. No publiques WebSocket antes del commit; si faltan inbox/outbox o constraint, propone migración SQL V2 separada y no afirma garantía. Luego añade gateway Socket.IO solo para refresco mediante GET autorizado, con rooms validadas.

## 13. Matriz de brechas antes de nuevas migraciones SQL

**La V1 es una estructura inicial útil, NO un backend de reglas hospitalarias completado.** Toda adición implica `db/migrations/V2__*.sql` con `UP` revisado, índices/FK, backfill si necesario, tests de migración y plan de rollback (cuando reversible); mantener hash/registro de versiones de migración, nunca editar SQL maestro ya aplicado.

| Brecha | Motivo de prioridad | Relación con CU | Recomendación |
|---|---|---|---|
| Sesiones/refresh/invitaciones | login confiable y revocación | IAM, OPS | V2-IAM, o integrarse con IdP aprobado |
| Idempotencia de comandos/lotes | Android offline y reintentos | ASI, OPS, MOV | V2-INBOX (actor, ámbito, key, hash, respuesta, expiración) |
| Outbox | WS consistente tras commit/reinicio | NOT, COB, BAL | V2-OUTBOX |
| Control de asignaciones solapadas | dos coordinadores simultáneos | COB, EVE | constraint transaccional/index + locks según casos |
| Vínculo reserva-necesidad | preasignación verificable | EVE, COB | puente con estados y vigencia |
| Historial de categorías y vigencia funcional | competencia y asignación | PER, CAL | revisión de entidades y vigencias |
| Pase/lista en lote con identidad de turno | sincronización/validación | ASI | entidad de pase/corte y versiones de payload |
| Plantilla de plazas vacantes | déficit estructural distinto de ausencia | DOT, COB | V2-PLAZAS |
| Importación staging/bitácora por fuente | migrar Sheets idempotentemente | MIG | V2-IMPORT |
| Enlace de turno, camas, productividad | formatos concretos de coordinación | ASI_CLIN, REP | V2-CLIN solo tras validar alcance |
| Documental/folios/actas | oficios y supervisión normativa | DOC | V2-DOC solo tras revisión Jurídica |
| Permisos/roles por vigencia y RLS | aislamiento inter-hospital | IAM, AUD | pruebas cross-hospital y política de aplicación/RLS |

**Proceso obligado por brecha:** crear `ADR` o decisión, SQL propuesto, test que falla en V1, migración en `sigeh_qa`, test que pasa, ejecución de `pg_dump` previo, revisión humana y despliegue fuera de horario sensible. No usar `DROP TABLE` sobre plantilla con datos reales.

## 14. Pruebas automáticas, Swagger y validación de entrega

### Pirámide de pruebas por caso

| Prueba | Herramienta/medio | Evidencia requerida |
|---|---|---|
| Unit use case y policy | runner actual Jest/Vitest | actor/estado/ámbito, regla pura y errores |
| Repository/DB integración | Postgres Docker `sigeh_qa` | constraint FK/EXCLUDE, transacción rollback y consulta real |
| API E2E | Supertest o equivalente del proyecto | body real + 401/403/409/422 + regresión |
| Contrato OpenAPI | export `docs/openapi.json` + esquema | método/path/opId/DTO/respuestas, sin huérfanos |
| Angular componentes | runner/config real de Angular | estados usuario, forms, `409` y accesibilidad |
| Mobile ViewModel/Room | instrumentación/emulador según proyecto | sin red, cola, dos dispositivos, token expirado |
| Concurrencia | dos procesos/sesiones DB | una asignación válida, no exceso ni doble cobertura |
| Funcional end-to-end | QA escenario sintético | flujo turno completo y balance reproducible |

### Prueba de integración más importante: una jornada completa

1. Crear hospital de prueba **ficticio**, división, servicio, categoría, dos empleados y contratos vigentes.
2. Crear programación MAT en fecha determinada; confirmar ausencia real del titular y registrar incidencia preliminar.
3. Supervisor valida estado y necesidad de 1 unidad; Coordinación valida presencia de eventual en reserva.
4. Crear asignación, comprobar que **todavía no hay** cobertura efectiva; registrar incorporación con hora real.
5. Aplicar cobertura y generar balance: cobertura 1, remanente 0; emitir snapshot con JSONB y actor.
6. Registrar licencia administrativa autorizada de fecha anterior; versión de incidencia nueva, cierre inmutable, cobertura real intacta.
7. Ver resultados de queries/Swagger y pantallas web/móvil; comparar versión histórica vs conciliada.
8. Segunda ejecución con dos coordinadores simultáneos: un solo registro efectivo; prueba offline móvil: mismo `clientEventId` reintentado sin duplicación.

**Evidencias:** `docs/pruebas/FC-02-evidencia.md` con timestamp, commit SHA, versión SQL, comando, resultado real, captura HTTP sanitizada, falla asociada y corrección. Datos sintéticos y scripts transaccionales o BD efímera.

### Puertas de calidad antes de fusionar PR

```bash
npm run lint
npm run build
npm test -- --runInBand  # SOLO si el runner es Jest y soporta esa opción
npm run test:e2e         # adaptar al script existente; ESM/Vitest difieren
curl -fsS http://localhost:3000/docs/openapi.json | jq '.paths | length'
```

El agente debe determinar los scripts de `package.json`; **no ejecutar el comando Jest en un proyecto Vitest**. CI debe arrancar Postgres QA desde migraciones, no dar por supuesto un volumen poblado. Testear SQL maestro en base efímera e incrementales en orden; no correr scripts destructivos en producción. Agregar escaneo de secretos, dependencias y formateo.

### Semáforo de avance de cada CU

- `PENDIENTE`: aún sin ficha.
- `ANALIZADO`: reglas/actores/criterios y brechas documentados.
- `CONTRATO`: endpoint/DTO/Swagger revisados, código puede no estar implementado.
- `BACKEND_IMPLEMENTADO`: ruta real + tests y política.
- `UI_CONECTADA`: web/móvil consume ruta real y maneja errores.
- `VALIDADO_QA`: pruebas del caso y permisos/concurrencia pertinentes con evidencias.
- `APROBADO`: aprobación real de contraparte facultada. **Nunca equiparar `VALIDADO_QA` con `APROBADO`.**

## 15. Roadmap por fases y entregables comprobables

| Sprint técnico / secuencia | Alcance CU seleccionado | Entregable concreto | Gate para avanzar |
|---|---|---|---|
| 0 · Diagnóstico | plataforma/BD/health | Git limpio, Docker verificado, app arranca y Swagger `/health` | `SELECT` QA y 200/503 probados |
| 1 · Identidad/ámbito | IAM-*, ORG lectura | autenticación, catálogo de ámbitos, guardas | 401/403 y hospital ajeno denegados |
| 2 · Personal | PER-01..08, ORG, DOT lectura | alta/consulta empleados, contrato, adscripción | RUD, FK, pruebas con QA y Angular ficha |
| 3 · Programación | CAL-01,03,05,10..16,19 | horario/patrón/guardia + calendario | guardia nocturna, descansos, festivos y exclusión |
| 4 · Pase de lista móvil | ASI-01..08,13 | capturar/validar asistencia con móvil | 0 duplicados, offline revisado, no falsa falta |
| 5 · Incidencias y movimientos | INC y MOV críticos | licencias, convenios, cambios descanso y pase | inmutabilidad, aprobación y cambio sin duplicar |
| 6 · Reserva y cobertura | EVE + COB críticos | reserva, asignación, incorporación, déficit | dos coordinadores no duplican, parcial correcto |
| 7 · Balance y reportes | BAL + REP P0 | matriz diaria, cierre, conciliación, PDF | cierre histórico intacto tras reclasificación |
| 8 · Coordinación clínica/import | ASI_CLIN + MIG P1/FUT | formularios agregados y reconciliación | solo migración aprobada + datos sintéticos |
| 9 · Documental (si se aprueba) | DOC FUT | folios, expediente y flujo jurídico | Jurídico autoriza alcance, integridad y retención |

**Entrega de cada sprint:** endpoints reales publicados en Swagger, casos de uso y matriz actualizados, prueba integración SQL/E2E, vista Angular/Compose conectada, logs/auditoría, changelog y riesgos pendientes. No desarrollar UI aislada que reproduzca cálculos distintos al servidor.

## 16. Prompts de orquestación para agentes de terminal (copiar/pegar)

### Prompt maestro — lectura y reglas del repositorio

> Trabajas sobre SIGE-H, ya existe un proyecto NestJS y una BD PostgreSQL Docker con esquema `sigeh` y 51 tablas. Fuentes: `SIGE-H_BASE_DATOS_MAESTRA_V1.sql`, `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md`, este manual y `AGENTS.md`. **No reimportes SQL maestro, no ejecutes `nest new`, no borres volúmenes ni elimines datos.** Antes de modificar, inspecciona carpeta, scripts, stack, runner y DDL. Trabaja en una sola historia CU por tanda. Contratos REST documentados en Swagger, DTOs validados, scope hospitalario y permisos, repositorios SQL parametrizados, transacciones y auditoría. Si falta modelo/permiso/decisión, especifica brecha y no inventes implementación. Cada entrega debe incluir: (1) objetivo y CU, (2) archivos modificados, (3) comandos ejecutados y resultados reales, (4) rutas Swagger y ejemplos ficticios, (5) tests/fallos, (6) pendientes y siguiente CU sugerido. Evita datos reales, secretos y tokens en logs o salida.

### Prompt de planificación de una historia (sin escribir código)

> Planifica CU `[ID]` leyendo DDL y especificación. Entrega ficha en `docs/casos-uso/`, matriz actor/permiso/ámbito, diagrama textual de secuencia, contrato OpenAPI propuesto, DTOs, SQL exacto, transacciones/locks, alternos y pruebas 401/403/409/422. Identifica pantalla Angular y móvil si aplica, estados de UX, WebSocket si necesario y V2 si falta estructura. **No edites código en esta pasada.**

### Prompt de backend (después de aprobar plan)

> Implementa CU `[ID]` según ficha revisada, solo archivos del módulo dueño. Controller REST liviano, DTOs Swagger, use case, policy, repository port y adapter PG, transacción y errores de dominio. Usa esquema `sigeh`, parámetros SQL, ámbito autenticado; no usar `postgres` superusuario, no `synchronize`. Agrega unit, integración DB y e2e de éxito, 401, 403, 409/422 y concurrencia si aplica. Corre build/tests y muestra evidencias reales y diff antes de finalizar.

### Prompt de frontend web

> Consume endpoints REALES de CU `[ID]` desde Angular. Prioriza estado autenticado, selector de ámbito, loading/empty/403/409/offline, validaciones accesibles y aviso de cambios en tiempo real. No repetir política de negocios en componente; servidor recalcula. Implementa unit e2e UI, registra evidencia en `docs/pruebas` y rutas en matriz.

### Prompt de frontend Android

> Implementa CU `[ID]` de campo usando Compose + ViewModel y cliente OpenAPI. Solo acciones preliminares offline permitidas: persiste `clientEventId` con Room y retransmite con WorkManager; conflictos y denegados visibles. Confirmaciones definitivas solo online. Agrega unit Room/ViewModel e instrumentación con reconexión y token revocado. Documenta estados locales sin prometer que están aplicados en servidor.

### Prompt de revisión de seguridad y regresión

> Revisa PR del CU `[ID]` como auditor independiente. Busca SQL no parametrizado, autoridad derivada del body, accesos cross-hospital, relaciones interservicio, inmutabilidad rota, eventos antes de COMMIT, duplicate assignment, ausencia falseada, logs con PII, datos sin control en Swagger y cache offline permanente. Ejecuta pruebas reales; reporta defectos con severidad/ruta/test reproducible. No declares aprobado nada que no haya pasado automatización y revisión humana cuando proceda.

### Prompt de implementación de migración V2

> Identifica brecha `[BRECHA]` en CU `[ID]` comparando esquema V1 y contrato funcional. Propón SQL incremental `db/migrations/V2__...sql` con restricciones, índices, backfill, safe rollout y test que falla antes/pasa después. Ejecuta SOLO en base QA clonada/efímera tras aprobación, nunca en producción ni en `sigeh` sin autorización. Incluye cambios al repositorio y pruebas de rollback cuando sea posible.

## 17. Anexo de trazabilidad: inventario íntegro de casos de uso y contratos propuestos

Las siguientes filas se incorporaron **automáticamente** desde `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` (271 casos), para que el agente pueda localizar exactamente su siguiente tarea sin crear rutas arbitrarias. **No implican implementación**. `AC`: acordado/fuente; `PROP`: propuesto; `FUT`: necesita definición o SQL V2. 

Formato: `CU | objetivo | actor | método/ruta relativa a /api/v1 | prioridad | estado`.

### Catálogo IAM — Identidad, usuarios y permisos (16)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-IAM-01` | Iniciar sesión y emitir tokens | Operador | `POST /auth/login` | P0 | AC |
| `CU-IAM-02` | Renovar token | Operador | `POST /auth/refresh` | P0 | AC |
| `CU-IAM-03` | Cerrar sesión y revocar sesión | Operador | `POST /auth/logout` | P0 | AC |
| `CU-IAM-04` | Consultar perfil y alcances propios | Operador | `GET /auth/me` | P0 | AC |
| `CU-IAM-05` | Listar sesiones activas del usuario | Operador | `GET /auth/sessions` | P1 | PROP |
| `CU-IAM-06` | Revocar sesión en otro dispositivo | Operador | `DELETE /auth/sessions/{sessionId}` | P1 | PROP |
| `CU-IAM-07` | Dar de alta cuenta de acceso | Administrador | `POST /usuarios` | P0 | AC |
| `CU-IAM-08` | Consultar y filtrar cuentas | Administrador | `GET /usuarios` | P0 | AC |
| `CU-IAM-09` | Modificar o bloquear cuenta | Administrador | `PATCH /usuarios/{usuarioId}` | P0 | AC |
| `CU-IAM-10` | Listar roles y permisos | Administrador | `GET /roles` | P0 | AC |
| `CU-IAM-11` | Asignar rol y alcance temporal | Administrador | `POST /usuarios/{usuarioId}/roles` | P0 | AC |
| `CU-IAM-12` | Revocar asignación de rol | Administrador | `DELETE /usuarios/{usuarioId}/roles/{usuarioRolId}` | P0 | AC |
| `CU-IAM-13` | Consultar permisos efectivos de usuario | Administrador | `GET /usuarios/{usuarioId}/permisos-efectivos` | P0 | PROP |
| `CU-IAM-14` | Consultar matriz de autorizaciones vigente | Autoridad | `GET /politicas-autorizacion` | P0 | PROP |
| `CU-IAM-15` | Aprobar/revisar cambio de matriz de autorización | Jefatura | `POST /politicas-autorizacion/versiones` | P1 | PROP |
| `CU-IAM-16` | Consultar auditoría de accesos denegados | Auditor | `GET /auditorias/accesos` | P1 | PROP |

### Catálogo ORG — Hospitales, divisiones, servicios, subáreas (13)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ORG-01` | Listar hospitales visibles | Operador | `GET /hospitales` | P0 | AC |
| `CU-ORG-02` | Crear hospital | Administrador | `POST /hospitales` | P1 | PROP |
| `CU-ORG-03` | Editar configuración hospital, huso y estado | Administrador | `PATCH /hospitales/{hospitalId}` | P0 | AC |
| `CU-ORG-04` | Consultar divisiones por hospital | Operador | `GET /hospitales/{hospitalId}/divisiones` | P0 | AC |
| `CU-ORG-05` | Crear división | Administrador | `POST /divisiones` | P0 | AC |
| `CU-ORG-06` | Actualizar división | Administrador | `PATCH /divisiones/{divisionId}` | P0 | AC |
| `CU-ORG-07` | Listar servicios y jerarquía | Operador | `GET /servicios` | P0 | AC |
| `CU-ORG-08` | Crear servicio bajo división | Administrador | `POST /servicios` | P0 | AC |
| `CU-ORG-09` | Modificar servicio o desactivarlo | Administrador | `PATCH /servicios/{servicioId}` | P0 | AC |
| `CU-ORG-10` | Listar subáreas por servicio | Operador | `GET /servicios/{servicioId}/subareas` | P0 | AC |
| `CU-ORG-11` | Crear subárea | Administrador | `POST /subareas` | P1 | AC |
| `CU-ORG-12` | Modificar subárea o desactivarla | Administrador | `PATCH /subareas/{subareaId}` | P1 | AC |
| `CU-ORG-13` | Consultar árbol de organización para filtros | Operador | `GET /organizacion/arbol` | P0 | PROP |

### Catálogo PER — Empleados, contratos, categorías y competencias (22)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-PER-01` | Alta de empleado con RUD único | RRHH | `POST /empleados` | P0 | AC |
| `CU-PER-02` | Buscar y paginar padrón por RUD, categoría, estado | RRHH | `GET /empleados` | P0 | AC |
| `CU-PER-03` | Consultar expediente laboral | RRHH | `GET /empleados/{empleadoId}` | P0 | AC |
| `CU-PER-04` | Actualizar datos no inmutables | RRHH | `PATCH /empleados/{empleadoId}` | P0 | AC |
| `CU-PER-05` | Inactivar empleado sin borrado | RRHH | `POST /empleados/{empleadoId}/inactivar` | P0 | AC |
| `CU-PER-06` | Registrar contrato base o eventual | RRHH | `POST /empleados/{empleadoId}/contratos` | P0 | AC |
| `CU-PER-07` | Consultar historial de contratos | RRHH | `GET /empleados/{empleadoId}/contratos` | P0 | AC |
| `CU-PER-08` | Suspender/cerrar contrato con vigencia | RRHH | `POST /contratos/{contratoId}/cerrar` | P0 | AC |
| `CU-PER-09` | Registrar cambio histórico de categoría | RRHH | `POST /contratos/{contratoId}/cambios-categoria` | P1 | PROP |
| `CU-PER-10` | Consultar categorías | Operador | `GET /categorias` | P0 | AC |
| `CU-PER-11` | Administrar categorías | Administrador | `POST /categorias` | P1 | AC |
| `CU-PER-12` | Consultar funciones | Operador | `GET /funciones` | P0 | AC |
| `CU-PER-13` | Administrar funciones | Administrador | `POST /funciones` | P1 | AC |
| `CU-PER-14` | Consultar competencias | Operador | `GET /competencias` | P0 | AC |
| `CU-PER-15` | Administrar competencias | Administrador | `POST /competencias` | P1 | AC |
| `CU-PER-16` | Registrar adscripción nominal/operativa | RRHH | `POST /contratos/{contratoId}/adscripciones` | P0 | AC |
| `CU-PER-17` | Consultar historial de adscripciones | RRHH | `GET /contratos/{contratoId}/adscripciones` | P0 | AC |
| `CU-PER-18` | Asignar función efectiva con vigencia | Jefatura | `POST /empleados/{empleadoId}/funciones` | P1 | AC |
| `CU-PER-19` | Validar competencia con vigencia/evidencia | Supervisor | `POST /empleados/{empleadoId}/competencias` | P0 | AC |
| `CU-PER-20` | Consultar competencias vigentes para un intervalo | Coordinación | `GET /empleados/{empleadoId}/competencias-vigentes` | P0 | PROP |
| `CU-PER-21` | Consultar elegibilidad de un empleado para servicio/turno | Coordinación | `POST /empleados/{empleadoId}/evaluar-elegibilidad` | P0 | PROP |
| `CU-PER-22` | Consultar expediente propio restringido | Empleado | `GET /mi-expediente` | P2 | PROP |

### Catálogo DOT — Plantilla de servicio y rotaciones por subárea (12)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-DOT-01` | Consultar plantilla objetivo del servicio | Jefatura | `GET /servicios/{servicioId}/plantilla` | P0 | AC |
| `CU-DOT-02` | Registrar dotación objetivo por categoría/turno | Jefatura | `POST /servicios/{servicioId}/plantilla` | P0 | AC |
| `CU-DOT-03` | Versionar/corregir plantilla con vigencia | Jefatura | `POST /plantillas/{plantillaId}/versiones` | P1 | PROP |
| `CU-DOT-04` | Consultar brecha plantilla contra personal contratado | Coordinación | `GET /servicios/{servicioId}/brecha-plantilla` | P0 | PROP |
| `CU-DOT-05` | Registrar plaza vacante y vigencia | RRHH | `POST /plazas-vacantes` | P1 | FUT |
| `CU-DOT-06` | Listar vacantes por hospital/servicio | RRHH | `GET /plazas-vacantes` | P1 | FUT |
| `CU-DOT-07` | Programar rotación mensual por subárea | Jefe servicio | `POST /rotaciones-subarea` | P0 | AC |
| `CU-DOT-08` | Consultar rotaciones mensuales | Supervisor | `GET /rotaciones-subarea` | P0 | AC |
| `CU-DOT-09` | Modificar rotación antes de vigencia | Jefe servicio | `PATCH /rotaciones-subarea/{rotacionId}` | P0 | AC |
| `CU-DOT-10` | Validar sumatoria sin doble conteo entre subáreas | Coordinación | `GET /servicios/{servicioId}/distribucion` | P0 | PROP |
| `CU-DOT-11` | Comparar plantilla RH y Coordinación | RRHH | `GET /conciliaciones/plantilla` | P1 | PROP |
| `CU-DOT-12` | Emitir observación de conciliación | RRHH | `POST /conciliaciones/plantilla/observaciones` | P1 | PROP |

### Catálogo CAL — Patrones laborales, guardias, festivos y programación (21)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-CAL-01` | Listar horarios configurables | Operador | `GET /horarios` | P0 | AC |
| `CU-CAL-02` | Crear horario autorizado | Administrador | `POST /horarios` | P1 | AC |
| `CU-CAL-03` | Listar patrones y sus siete días | Operador | `GET /patrones-laborales` | P0 | AC |
| `CU-CAL-04` | Crear patrón adicional manteniendo vigencia | Administrador | `POST /patrones-laborales` | P1 | AC |
| `CU-CAL-05` | Asignar patrón de descanso a contrato | RRHH | `POST /contratos/{contratoId}/patrones` | P0 | AC |
| `CU-CAL-06` | Consultar historial de patrones de contrato | Jefatura | `GET /contratos/{contratoId}/patrones` | P0 | AC |
| `CU-CAL-07` | Cambiar patrón permanente con aprobación | Jefatura | `POST /contratos/{contratoId}/cambiar-patron` | P0 | PROP |
| `CU-CAL-08` | Listar festivos por hospital | Operador | `GET /calendario-festivos` | P0 | AC |
| `CU-CAL-09` | Crear festivo oficial hospitalario | Administrador | `POST /calendario-festivos` | P1 | AC |
| `CU-CAL-10` | Generar calendario laboral desde patrones y contratos | Jefatura | `POST /programaciones/generar` | P0 | PROP |
| `CU-CAL-11` | Simular programación sin persistir | Jefatura | `POST /programaciones/simular` | P0 | PROP |
| `CU-CAL-12` | Consultar programación por servicio, día y turno | Operador | `GET /programaciones` | P0 | AC |
| `CU-CAL-13` | Consultar programación de empleado | Operador | `GET /empleados/{empleadoId}/programaciones` | P0 | AC |
| `CU-CAL-14` | Registrar jornada extraordinaria autorizada | Supervisor | `POST /programaciones/extraordinarias` | P0 | PROP |
| `CU-CAL-15` | Cancelar programación conservando historia | Jefatura | `POST /programaciones/{programacionId}/cancelar` | P0 | PROP |
| `CU-CAL-16` | Validar solapes, vigencias y descanso legal/política | Jefatura | `POST /programaciones/validar` | P0 | PROP |
| `CU-CAL-17` | Publicar rol del periodo con control de versión | Jefatura | `POST /programaciones/publicaciones` | P1 | PROP |
| `CU-CAL-18` | Consultar diferencias entre versión publicada y cambios | Supervisor | `GET /programaciones/diferencias` | P1 | PROP |
| `CU-CAL-19` | Consultar guardias nocturnas fijas y excepciones | Supervisor | `GET /programaciones/guardias-nocturnas` | P0 | PROP |
| `CU-CAL-20` | Programar acumulada en festivo según esquema individual | Jefatura | `POST /programaciones/festivos` | P1 | PROP |
| `CU-CAL-21` | Previsualizar ausencias conocidas futuras | Coordinación | `GET /programaciones/prevision-ausencias` | P0 | PROP |

### Catálogo ASI — Pase de lista y estados de asistencia (15)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ASI-01` | Consultar pase de lista del servicio/turno | Jefe servicio | `GET /pases-lista` | P0 | AC |
| `CU-ASI-02` | Capturar asistencia por jornada | Jefe servicio | `PUT /programaciones/{programacionId}/asistencia` | P0 | AC |
| `CU-ASI-03` | Capturar lote offline idempotente | Jefe servicio | `POST /asistencias/lotes` | P0 | PROP |
| `CU-ASI-04` | Registrar evento de llegada, salida o corrección | Jefe servicio | `POST /asistencias/{asistenciaId}/eventos` | P0 | AC |
| `CU-ASI-05` | Marcar ausencia pendiente de justificar | Jefe servicio | `POST /asistencias/{asistenciaId}/ausencia` | P0 | AC |
| `CU-ASI-06` | Corregir captura conservando evento original | Jefe servicio | `POST /asistencias/{asistenciaId}/correcciones` | P0 | PROP |
| `CU-ASI-07` | Consultar estado actual y eventos | Supervisor | `GET /asistencias/{asistenciaId}` | P0 | AC |
| `CU-ASI-08` | Validar pase de lista por servicio/turno | Supervisor | `POST /pases-lista/{paseListaId}/validar` | P0 | PROP |
| `CU-ASI-09` | Observar/devolver pase de lista | Supervisor | `POST /pases-lista/{paseListaId}/observar` | P0 | PROP |
| `CU-ASI-10` | Publicar estado validado a Coordinación | Supervisor | `POST /pases-lista/{paseListaId}/liberar` | P0 | PROP |
| `CU-ASI-11` | Ver discrepancia entre presencia hospital e incorporación | Coordinación | `GET /asistencias/discrepancias` | P1 | PROP |
| `CU-ASI-12` | Consultar bitácora de correcciones y autor | Auditor | `GET /asistencias/{asistenciaId}/historial` | P0 | AC |
| `CU-ASI-13` | Sincronizar cambios móviles con conflictos | Móvil | `POST /sincronizacion/asistencias` | P0 | PROP |
| `CU-ASI-14` | Consultar estado de solicitudes offline | Móvil | `GET /sincronizacion/lotes/{loteId}` | P0 | PROP |
| `CU-ASI-15` | Registrar verificación de presencia en Coordinación | Coordinación | `POST /presencias-coordinacion` | P0 | PROP |

### Catálogo INC — Calendario de incidencias y reclasificación (18)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-INC-01` | Consultar catálogo institucional de incidencias | Operador | `GET /tipos-incidencia` | P0 | AC |
| `CU-INC-02` | Administrar tipo configurable de incidencia | Administrador | `POST /tipos-incidencia` | P1 | AC |
| `CU-INC-03` | Registrar incidencia por periodo | Jefe servicio | `POST /incidencias` | P0 | AC |
| `CU-INC-04` | Consultar incidencias con filtros | Supervisor | `GET /incidencias` | P0 | AC |
| `CU-INC-05` | Consultar incidencia y versiones | Supervisor | `GET /incidencias/{incidenciaId}` | P0 | AC |
| `CU-INC-06` | Relacionar jornadas afectadas | Jefe servicio | `POST /incidencias/{incidenciaId}/jornadas` | P0 | AC |
| `CU-INC-07` | Enviar incidencia a revisión | Jefe servicio | `POST /incidencias/{incidenciaId}/enviar` | P0 | PROP |
| `CU-INC-08` | Autorizar o rechazar con facultad | Autoridad | `POST /incidencias/{incidenciaId}/decisiones` | P0 | AC |
| `CU-INC-09` | Adjuntar justificante con hash | Jefe servicio | `POST /incidencias/{incidenciaId}/documentos` | P0 | AC |
| `CU-INC-10` | Consultar o descargar justificante autorizado | RRHH | `GET /incidencias/{incidenciaId}/documentos/{documentoId}` | P0 | PROP |
| `CU-INC-11` | Reclasificar retroactivamente con nueva versión | RRHH | `POST /incidencias/{incidenciaId}/reclasificaciones` | P0 | PROP |
| `CU-INC-12` | Consultar versiones con fecha efectiva y registro | Auditor | `GET /incidencias/{incidenciaId}/versiones` | P0 | AC |
| `CU-INC-13` | Consultar calendario de incidencias servicio/división | Supervisor | `GET /incidencias/calendario` | P0 | PROP |
| `CU-INC-14` | Consultar incidencias administrativas vs operativas | RRHH | `GET /incidencias/conciliacion` | P0 | PROP |
| `CU-INC-15` | Cancelar con motivo sin borrar antecedentes | Autoridad | `POST /incidencias/{incidenciaId}/cancelar` | P1 | PROP |
| `CU-INC-16` | Generar alertas por vencimientos/documentos faltantes | RRHH | `GET /incidencias/alertas` | P1 | PROP |
| `CU-INC-17` | Consultar periodo de incapacidad/licencia/vacaciones futuro | Coordinación | `GET /incidencias/prevision` | P0 | PROP |
| `CU-INC-18` | Emitir reporte de ausentismo por causas y turnos | RRHH | `GET /reportes/ausentismo` | P0 | PROP |

### Catálogo MOV — Convenios, cambios de descanso y pases de salida (20)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-MOV-01` | Solicitar convenio sustitución sin intercambio futuro | Empleado | `POST /movimientos/convenios` | P0 | AC |
| `CU-MOV-02` | Registrar aceptación del sustituto | Sustituto | `POST /movimientos/{movimientoId}/aceptar` | P0 | PROP |
| `CU-MOV-03` | Consultar convenio y sus jornadas | Supervisor | `GET /movimientos/{movimientoId}` | P0 | AC |
| `CU-MOV-04` | Revisar elegibilidad del sustituto | Coordinación | `POST /movimientos/{movimientoId}/validar-convenio` | P0 | PROP |
| `CU-MOV-05` | Autorizar/rechazar convenio | Autoridad | `POST /movimientos/{movimientoId}/decisiones` | P0 | AC |
| `CU-MOV-06` | Aplicar convenio a programaciones de forma atómica | Coordinación | `POST /movimientos/{movimientoId}/aplicar` | P0 | PROP |
| `CU-MOV-07` | Revertir convenio autorizadamente con auditoría | Autoridad | `POST /movimientos/{movimientoId}/revertir` | P0 | PROP |
| `CU-MOV-08` | Solicitar cambio ocasional de descanso | Empleado | `POST /movimientos/cambios-descanso` | P0 | AC |
| `CU-MOV-09` | Validar y simular nueva jornada/descanso | Supervisor | `POST /movimientos/{movimientoId}/simular` | P0 | PROP |
| `CU-MOV-10` | Aplicar cambio ocasional y conservar patrón | Autoridad | `POST /movimientos/{movimientoId}/aplicar-descanso` | P0 | PROP |
| `CU-MOV-11` | Solicitar pase de salida | Empleado | `POST /movimientos/pases-salida` | P0 | AC |
| `CU-MOV-12` | Autorizar pase de salida | Autoridad | `POST /movimientos/{movimientoId}/decisiones` | P0 | AC |
| `CU-MOV-13` | Registrar salida real | Jefe servicio | `POST /movimientos/{movimientoId}/registrar-salida` | P0 | PROP |
| `CU-MOV-14` | Registrar regreso real si se conoce | Jefe servicio | `POST /movimientos/{movimientoId}/registrar-regreso` | P0 | PROP |
| `CU-MOV-15` | Cerrar pase sin regreso confirmado | Supervisor | `POST /movimientos/{movimientoId}/cerrar-sin-regreso` | P0 | PROP |
| `CU-MOV-16` | Cerrar pase sin dato verificado | Supervisor | `POST /movimientos/{movimientoId}/cerrar-sin-dato` | P0 | PROP |
| `CU-MOV-17` | Consultar calidad de evidencia del pase | Supervisor | `GET /movimientos/{movimientoId}/evidencia` | P0 | PROP |
| `CU-MOV-18` | Cancelar/revocar movimiento con efecto histórico | Autoridad | `POST /movimientos/{movimientoId}/revocar` | P0 | PROP |
| `CU-MOV-19` | Consultar movimientos por periodo y tipo | Supervisor | `GET /movimientos` | P0 | AC |
| `CU-MOV-20` | Consultar eventos/decisiones inmutables | Auditor | `GET /movimientos/{movimientoId}/historial` | P0 | AC |

### Catálogo EVE — Reserva, preasignaciones y disponibilidad eventual (12)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-EVE-01` | Consultar eventuales elegibles con contrato vigente | Coordinación | `GET /eventuales` | P0 | AC |
| `CU-EVE-02` | Declarar disponibilidad eventual | Coordinación | `POST /eventuales/disponibilidades` | P0 | AC |
| `CU-EVE-03` | Verificar llegada real a Coordinación | Coordinación | `POST /eventuales/disponibilidades/{disponibilidadId}/validar-presencia` | P0 | AC |
| `CU-EVE-04` | Marcar indisponible/retiro | Coordinación | `POST /eventuales/disponibilidades/{disponibilidadId}/finalizar` | P0 | AC |
| `CU-EVE-05` | Consultar sala de espera por turno y competencias | Coordinación | `GET /eventuales/reserva` | P0 | PROP |
| `CU-EVE-06` | Consultar disponibilidades futuras y compromisos | Coordinación | `GET /eventuales/calendario` | P0 | PROP |
| `CU-EVE-07` | Reservar eventual para déficit previsto | Coordinación | `POST /eventuales/preasignaciones` | P0 | PROP |
| `CU-EVE-08` | Confirmar aceptación de preasignación | Eventual | `POST /eventuales/preasignaciones/{preasignacionId}/aceptar` | P1 | PROP |
| `CU-EVE-09` | Liberar reserva no utilizada | Coordinación | `POST /eventuales/preasignaciones/{preasignacionId}/liberar` | P0 | PROP |
| `CU-EVE-10` | Consultar disponibilidad con conflictos de horario | Coordinación | `POST /eventuales/evaluar-disponibilidad` | P0 | PROP |
| `CU-EVE-11` | Registrar ausencia del eventual preasignado | Jefe servicio | `POST /eventuales/preasignaciones/{preasignacionId}/no-presentado` | P0 | PROP |
| `CU-EVE-12` | Medir espera y tiempo de asignación | Coordinación | `GET /eventuales/metricas-espera` | P1 | PROP |

### Catálogo COB — Necesidades, asignaciones, incorporaciones y cobertura real (24)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-COB-01` | Detectar déficit según plantilla y demanda | Coordinación | `POST /necesidades/evaluar` | P0 | PROP |
| `CU-COB-02` | Registrar necesidad por ausencia/plaza/complejidad | Supervisor | `POST /necesidades-cobertura` | P0 | AC |
| `CU-COB-03` | Consultar necesidades por estado y franja | Coordinación | `GET /necesidades-cobertura` | P0 | AC |
| `CU-COB-04` | Consultar detalle y perfil requerido | Coordinación | `GET /necesidades-cobertura/{necesidadId}` | P0 | AC |
| `CU-COB-05` | Validar o rechazar necesidad | Supervisor | `POST /necesidades-cobertura/{necesidadId}/validar` | P0 | PROP |
| `CU-COB-06` | Registrar competencias exigidas | Supervisor | `PUT /necesidades-cobertura/{necesidadId}/competencias` | P0 | AC |
| `CU-COB-07` | Sugerir candidatos compatibles sin autoasignar | Coordinación | `GET /necesidades-cobertura/{necesidadId}/candidatos` | P0 | PROP |
| `CU-COB-08` | Simular asignación y efectos en servicio origen | Coordinación | `POST /asignaciones/simular` | P0 | PROP |
| `CU-COB-09` | Crear asignación habitual/preasignación/reserva | Coordinación | `POST /asignaciones-operativas` | P0 | AC |
| `CU-COB-10` | Consultar asignaciones por turno/servicio | Coordinación | `GET /asignaciones-operativas` | P0 | AC |
| `CU-COB-11` | Confirmar asignación autorizada | Coordinación | `POST /asignaciones-operativas/{asignacionId}/confirmar` | P0 | PROP |
| `CU-COB-12` | Cancelar asignación con motivo | Coordinación | `POST /asignaciones-operativas/{asignacionId}/cancelar` | P0 | PROP |
| `CU-COB-13` | Verificar recepción real en servicio | Jefe servicio | `POST /asignaciones-operativas/{asignacionId}/incorporaciones` | P0 | AC |
| `CU-COB-14` | Confirmar fin efectivo de servicio | Jefe servicio | `POST /incorporaciones/{incorporacionId}/finalizar` | P0 | PROP |
| `CU-COB-15` | Aplicar incorporación a necesidad en intervalo | Coordinación | `POST /necesidades-cobertura/{necesidadId}/aplicaciones` | P0 | AC |
| `CU-COB-16` | Anular aplicación errónea conservando traza | Autoridad | `POST /aplicaciones-cobertura/{aplicacionId}/anular` | P0 | PROP |
| `CU-COB-17` | Consultar déficit efectivo remanente por intervalo | Coordinación | `GET /necesidades-cobertura/{necesidadId}/remanente` | P0 | PROP |
| `CU-COB-18` | Transferir persona entre servicios con autorización | Supervisor | `POST /movimientos-operativos` | P0 | AC |
| `CU-COB-19` | Confirmar recepción en nuevo servicio | Jefe servicio | `POST /movimientos-operativos/{movimientoOperativoId}/recepcion` | P0 | PROP |
| `CU-COB-20` | Consultar mapa de cobertura consolidado | Coordinación | `GET /cobertura/mapa` | P0 | PROP |
| `CU-COB-21` | Consultar alertas de duplicidad, competencia e intervalos | Coordinación | `GET /cobertura/alertas` | P0 | PROP |
| `CU-COB-22` | Cerrar necesidad con déficit no cubierto documentado | Supervisor | `POST /necesidades-cobertura/{necesidadId}/cerrar` | P0 | PROP |
| `CU-COB-23` | Recalcular semáforo con criterios institucionales vigentes | Coordinación | `POST /cobertura/recalcular` | P1 | PROP |
| `CU-COB-24` | Listar órdenes de movimientos internas del turno | Supervisor | `GET /movimientos-operativos` | P0 | AC |

### Catálogo ASI_CLIN — Ocupación, complejidad y hoja de enlace (15)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-ASI_CLIN-01` | Consultar catálogo de indicadores asistenciales | Supervisor | `GET /indicadores-complejidad` | P0 | AC |
| `CU-ASI_CLIN-02` | Administrar indicador y unidad | Administrador | `POST /indicadores-complejidad` | P1 | AC |
| `CU-ASI_CLIN-03` | Capturar medición por subárea/servicio e instante | Supervisor | `POST /mediciones-complejidad` | P0 | AC |
| `CU-ASI_CLIN-04` | Consultar series de complejidad por turno | Coordinación | `GET /mediciones-complejidad` | P0 | AC |
| `CU-ASI_CLIN-05` | Registrar censo agregado de camas/ocupación | Jefe servicio | `POST /censos-camas` | P1 | FUT |
| `CU-ASI_CLIN-06` | Consultar censo por servicio/turno | Supervisor | `GET /censos-camas` | P1 | FUT |
| `CU-ASI_CLIN-07` | Registrar consumo agregado de hemocomponentes | Jefe servicio | `POST /productividad/hemocomponentes` | P2 | FUT |
| `CU-ASI_CLIN-08` | Registrar productividad quirúrgica | Jefe servicio | `POST /productividad/quirofanos` | P2 | FUT |
| `CU-ASI_CLIN-09` | Registrar productividad obstétrica | Jefe servicio | `POST /productividad/tocoquirurgica` | P2 | FUT |
| `CU-ASI_CLIN-10` | Registrar productividad de CEyE/esterilización | Jefe servicio | `POST /productividad/esterilizacion` | P2 | FUT |
| `CU-ASI_CLIN-11` | Registrar eventos y equipos de soporte asistencial agregados | Jefe servicio | `POST /complejidad/eventos` | P1 | FUT |
| `CU-ASI_CLIN-12` | Consultar hoja de enlace consolidada por turno | Coordinación | `GET /enlaces-turno` | P1 | FUT |
| `CU-ASI_CLIN-13` | Capturar/actualizar borrador de enlace | Supervisor | `POST /enlaces-turno` | P1 | FUT |
| `CU-ASI_CLIN-14` | Validar/firmar cierre de enlace | Coordinación | `POST /enlaces-turno/{enlaceId}/validar` | P1 | FUT |
| `CU-ASI_CLIN-15` | Consultar impacto de demanda sobre necesidades de cobertura | Coordinación | `GET /cobertura/justificacion-complejidad` | P1 | PROP |

### Catálogo BAL — Balance diario, cierres y conciliación retroactiva (18)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-BAL-01` | Consultar balance diario por servicio y turno | Supervisor | `GET /balances/diarios` | P0 | PROP |
| `CU-BAL-02` | Consultar balance de personal detallado con renglones | Jefe servicio | `GET /balances/diarios/{servicioId}/detalle` | P0 | PROP |
| `CU-BAL-03` | Previsualizar total programado vs asistencia y necesidades | Supervisor | `POST /balances/simular-cierre` | P0 | PROP |
| `CU-BAL-04` | Emitir cierre operativo versionado inmutable | Supervisor | `POST /balances/cierres` | P0 | AC |
| `CU-BAL-05` | Consultar cierres por servicio/fecha | Auditor | `GET /balances/cierres` | P0 | AC |
| `CU-BAL-06` | Consultar snapshot exacto emitido | Auditor | `GET /balances/cierres/{cierreId}` | P0 | AC |
| `CU-BAL-07` | Emitir rectificación como versión nueva | Autoridad | `POST /balances/cierres/{cierreId}/rectificaciones` | P0 | PROP |
| `CU-BAL-08` | Consultar comparación original y conciliado | RRHH | `GET /balances/cierres/{cierreId}/conciliacion` | P0 | PROP |
| `CU-BAL-09` | Consultar asistencia, faltas, cubiertas y sin cubrir | Coordinación | `GET /balances/indicadores` | P0 | PROP |
| `CU-BAL-10` | Consultar matriz mensual por servicio, día y turno | Jefatura | `GET /balances/matriz-mensual` | P0 | PROP |
| `CU-BAL-11` | Consultar cambios internos/convenios/suplencias | Supervisor | `GET /balances/movimientos-resumen` | P0 | PROP |
| `CU-BAL-12` | Consultar reporte de incidencias pendientes de validar | Jefatura | `GET /balances/pendientes` | P0 | PROP |
| `CU-BAL-13` | Descargar balance PDF con versión/huella | Supervisor | `GET /balances/cierres/{cierreId}/pdf` | P0 | PROP |
| `CU-BAL-14` | Descargar balance CSV/XLSX autorizado | RRHH | `GET /balances/cierres/{cierreId}/exportacion` | P1 | PROP |
| `CU-BAL-15` | Consultar evidencia de correcciones posteriores al corte | Auditor | `GET /balances/cierres/{cierreId}/correcciones-posteriores` | P0 | PROP |
| `CU-BAL-16` | Comparar reporte de turno vs HR/plantilla vigente | RRHH | `GET /balances/conciliacion-rh` | P1 | PROP |
| `CU-BAL-17` | Analizar tasa ausentismo con denominador definido | Jefatura | `GET /balances/tasas-ausentismo` | P0 | PROP |
| `CU-BAL-18` | Consultar cobertura por fuente y categoría | Coordinación | `GET /balances/fuentes-cobertura` | P0 | PROP |

### Catálogo DOC — Oficios, actas y hallazgos de supervisión (futuro) (17)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-DOC-01` | Consultar catálogo de tipos de documento administrativo | Jurídico | `GET /documentos/tipos` | P2 | FUT |
| `CU-DOC-02` | Crear borrador de oficio o acta | Supervisor | `POST /documentos/actas` | P2 | FUT |
| `CU-DOC-03` | Consultar actas dentro de jurisdicción | Autoridad | `GET /documentos/actas` | P2 | FUT |
| `CU-DOC-04` | Consultar expediente de acta y participantes | Autoridad | `GET /documentos/actas/{actaId}` | P2 | FUT |
| `CU-DOC-05` | Capturar hechos y testigos con vigencia de rol | Supervisor | `PATCH /documentos/actas/{actaId}` | P2 | FUT |
| `CU-DOC-06` | Adjuntar evidencia minimizada y cifrada | Supervisor | `POST /documentos/actas/{actaId}/evidencias` | P2 | FUT |
| `CU-DOC-07` | Enviar acta a revisión jurídica/jerárquica | Supervisor | `POST /documentos/actas/{actaId}/enviar-revision` | P2 | FUT |
| `CU-DOC-08` | Registrar observaciones y devolución | Autoridad | `POST /documentos/actas/{actaId}/revisiones` | P2 | FUT |
| `CU-DOC-09` | Emitir folio inmutable en transacción autorizada | Autoridad | `POST /documentos/actas/{actaId}/emitir` | P2 | FUT |
| `CU-DOC-10` | Generar PDF/QR de verificación del documento | Autoridad | `GET /documentos/actas/{actaId}/pdf` | P2 | FUT |
| `CU-DOC-11` | Registrar notificación y acuse de enterado | Empleado | `POST /documentos/actas/{actaId}/acuses` | P2 | FUT |
| `CU-DOC-12` | Registrar firmas de testigos sin falsificar firma | Autoridad | `POST /documentos/actas/{actaId}/firmas` | P2 | FUT |
| `CU-DOC-13` | Crear fe de erratas o cancelación enlazada | Jurídico | `POST /documentos/actas/{actaId}/correcciones` | P2 | FUT |
| `CU-DOC-14` | Escalar expediente a RRHH/Jurídico | Jefatura | `POST /documentos/actas/{actaId}/escalamientos` | P2 | FUT |
| `CU-DOC-15` | Levantar cédula de hallazgo de supervisión | Supervisor | `POST /supervision-calidad/hallazgos` | P2 | FUT |
| `CU-DOC-16` | Registrar subsanación/verificación de hallazgo | Supervisor | `POST /supervision-calidad/hallazgos/{hallazgoId}/seguimientos` | P2 | FUT |
| `CU-DOC-17` | Consultar indicadores de hallazgos no sancionatorios | Jefatura | `GET /supervision-calidad/indicadores` | P2 | FUT |

### Catálogo REP — Informes, tableros, exportaciones (13)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-REP-01` | Dashboard coordinación tiempo real | Coordinación | `GET /tableros/coordinacion` | P0 | PROP |
| `CU-REP-02` | Dashboard jefatura multi-división | Jefatura | `GET /tableros/jefatura` | P1 | PROP |
| `CU-REP-03` | Dashboard supervisor por división | Supervisor | `GET /tableros/supervision` | P0 | PROP |
| `CU-REP-04` | Reportar déficit por servicio/turno | Jefatura | `GET /reportes/deficits` | P0 | PROP |
| `CU-REP-05` | Reportar tiempos de cobertura y esperas | Jefatura | `GET /reportes/tiempos-cobertura` | P1 | PROP |
| `CU-REP-06` | Reportar cobertura efectiva vs asignaciones | Coordinación | `GET /reportes/cobertura-efectiva` | P0 | PROP |
| `CU-REP-07` | Reportar movimientos internos/convenios/pases | Jefatura | `GET /reportes/movimientos` | P1 | PROP |
| `CU-REP-08` | Reportar incidencias por causa/periodo | RRHH | `GET /reportes/incidencias` | P0 | PROP |
| `CU-REP-09` | Reportar vencimiento de contratos/competencias | RRHH | `GET /reportes/vencimientos` | P1 | PROP |
| `CU-REP-10` | Reportar demanda/ocupación y complejidad | Jefatura | `GET /reportes/carga-asistencial` | P1 | PROP |
| `CU-REP-11` | Exportar reporte autorizado a PDF | Jefatura | `POST /reportes/exportaciones` | P1 | PROP |
| `CU-REP-12` | Consultar estado de exportación asíncrona | Jefatura | `GET /reportes/exportaciones/{exportacionId}` | P1 | PROP |
| `CU-REP-13` | Consultar diccionario de KPIs y fórmulas vigentes | Auditor | `GET /indicadores/definiciones` | P0 | PROP |

### Catálogo MIG — Importación/conciliación de datos Google Sheets / RH (13)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-MIG-01` | Registrar fuente de datos y esquema de columnas | Administrador | `POST /migraciones/fuentes` | P1 | FUT |
| `CU-MIG-02` | Subir archivo CSV/XLSX para staging | Administrador | `POST /migraciones/lotes` | P0 | FUT |
| `CU-MIG-03` | Consultar mapeo de columnas y tipos | Administrador | `GET /migraciones/lotes/{loteId}/mapeo` | P0 | FUT |
| `CU-MIG-04` | Configurar mapeo de RUD, categoría, turno, descanso | Administrador | `PUT /migraciones/lotes/{loteId}/mapeo` | P0 | FUT |
| `CU-MIG-05` | Prevalidar lotes sin persistencia final | Administrador | `POST /migraciones/lotes/{loteId}/prevalidar` | P0 | FUT |
| `CU-MIG-06` | Consultar errores y duplicados | Administrador | `GET /migraciones/lotes/{loteId}/errores` | P0 | FUT |
| `CU-MIG-07` | Simular consolidación entre plantillas RH y Coordinación | RRHH | `POST /migraciones/lotes/{loteId}/simular` | P0 | FUT |
| `CU-MIG-08` | Confirmar importación transaccional e idempotente | Administrador | `POST /migraciones/lotes/{loteId}/aplicar` | P0 | FUT |
| `CU-MIG-09` | Consultar bitácora, versión fuente y huella | Auditor | `GET /migraciones/lotes/{loteId}` | P0 | FUT |
| `CU-MIG-10` | Revertir mediante operación compensatoria | Administrador | `POST /migraciones/lotes/{loteId}/revertir` | P1 | FUT |
| `CU-MIG-11` | Exportar discrepancias de conciliación | RRHH | `GET /migraciones/lotes/{loteId}/discrepancias` | P1 | FUT |
| `CU-MIG-12` | Registrar lote histórico de balances sin adjudicar semántica | Administrador | `POST /migraciones/balances-historicos` | P1 | FUT |
| `CU-MIG-13` | Mapear códigos de motivos de ausencia heredados | RRHH | `POST /migraciones/catalogos-incidencia` | P0 | FUT |

### Catálogo NOT — Alertas y eventos en tiempo real (6)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-NOT-01` | Consultar notificaciones de usuario | Operador | `GET /notificaciones` | P1 | FUT |
| `CU-NOT-02` | Marcar notificación como leída | Operador | `POST /notificaciones/{notificacionId}/leer` | P1 | FUT |
| `CU-NOT-03` | Configurar preferencias de aviso | Operador | `PUT /notificaciones/preferencias` | P2 | FUT |
| `CU-NOT-04` | Registrar token push móvil con consentimiento | Móvil | `POST /notificaciones/dispositivos` | P1 | FUT |
| `CU-NOT-05` | Registrar entrega/fallo de notificación | Sistema | `POST /notificaciones/entregas` | P2 | FUT |
| `CU-NOT-06` | Obtener snapshot tras reconexión de WebSocket | Operador | `GET /eventos/snapshot` | P0 | PROP |

### Catálogo AUD — Auditoría de acciones y accesos (8)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-AUD-01` | Consultar auditoría filtrada por ámbito y acción | Auditor | `GET /auditorias` | P0 | AC |
| `CU-AUD-02` | Consultar trazabilidad de registro por entidad | Auditor | `GET /auditorias/entidades/{tipo}/{id}` | P0 | PROP |
| `CU-AUD-03` | Consultar decisiones y eventos históricos | Auditor | `GET /auditorias/decisiones` | P0 | PROP |
| `CU-AUD-04` | Exportar evidencia de operación con hash | Auditor | `POST /auditorias/exportaciones` | P1 | PROP |
| `CU-AUD-05` | Reportar intento de acceso fuera de ámbito | Sistema | `POST /seguridad/incidentes` | P1 | PROP |
| `CU-AUD-06` | Ver políticas efectivas por hospital/servicio | Auditor | `GET /seguridad/politicas` | P0 | PROP |
| `CU-AUD-07` | Consultar estado de retención y bloqueo legal | Jurídico | `GET /seguridad/retencion` | P2 | FUT |
| `CU-AUD-08` | Registrar solicitud de rectificación de datos personales | RRHH | `POST /privacidad/solicitudes` | P2 | FUT |

### Catálogo OPS — Salud técnica, sincronización y despliegue (8)

| CU | Operación | Actor | Método y ruta | Prioridad | Estado |
|---|---|---|---|---|---|
| `CU-OPS-01` | Health básico de API | Infra | `GET /health/live` | P0 | PROP |
| `CU-OPS-02` | Readiness PostgreSQL y colas | Infra | `GET /health/ready` | P0 | PROP |
| `CU-OPS-03` | Consultar versión de contrato API | Desarrollador | `GET /meta/version` | P0 | PROP |
| `CU-OPS-04` | Sincronizar lotes de comandos offline con idempotencia | Móvil | `POST /sync/lotes` | P0 | PROP |
| `CU-OPS-05` | Obtener cambios autorizados desde cursor | Móvil | `GET /sync/cambios` | P0 | PROP |
| `CU-OPS-06` | Consultar resultado de operación por clave idempotencia | Móvil | `GET /operaciones/{operacionId}` | P0 | PROP |
| `CU-OPS-07` | Consultar catálogos incrementales para móvil | Móvil | `GET /sync/catalogos` | P0 | PROP |
| `CU-OPS-08` | Consultar resumen de lag de sincronización | Infra | `GET /ops/sync-metricas` | P1 | PROP |

## 18. Fuentes, coherencia documental y decisiones que requieren validación

**Artefactos del propio proyecto:**

- `SIGE-H_BASE_DATOS_MAESTRA_V1.sql` — SQL real del esquema, importado en PostgreSQL, 51 tablas y 113 FK (no inventar columnas).
- `SIGE-H_01_diagnostico_integridad.sql` y `SIGE-H_02_pruebas_transaccionales.sql` — pruebas ejecutadas por el equipo (0 hallazgos estructurales y 8/8 transaccionales). `SIGE-H_03_integracion_operativa.sql`, `04_auditoria_permisos.sql` y `05_concurrencia.sh`: **sin salida de ejecución compartida**; no darlas por pasadas.
- `SIGE-H_Especificacion_Casos_de_Uso_y_API_v1_0.md` — inventario completo de 271 casos; fuente de rutas de §17.
- [Carpeta Administración de Proyectos de TI](https://drive.google.com/drive/folders/1F2I36vDJV_2epP0Inw8OkmsovN4onivI) y documentos [ERS P2-I03](https://docs.google.com/document/d/1SHDrxu1wuy6M6eF8wnOjoD7qIOCSekpbGB9a31DigWU/edit), [Acta P2-F01](https://docs.google.com/document/d/1dNBVGRpNH7cD4LSTh8w6z8CwDYNMJjKrYfNS1Hr1LDI/edit), [Alcance P2-I04](https://docs.google.com/document/d/1atJrbViPSFovtZE_wKVs76MusbQjjjnb2J-AVwEpuUA/edit), [Calidad P2-I09](https://docs.google.com/document/d/1X4bu2XltVEkIIHbTjI2nZOP0QcEAMeGQS3BQeRr8fTM/edit) y [UML casos de uso](https://docs.google.com/document/d/17YJtaiOmZJ4-OWC3v1sgQf0AAuBN4wir3kJ3DaocIGE/edit).
- [JIM Plataformas](https://drive.google.com/drive/folders/1OigWJjjedYA1-WETWMosRS9KjZXSWNst), [Balance de personal BP-2025](https://docs.google.com/spreadsheets/d/1eNXKx2CzAe8x_XRk3WMUiIrewOBHJcE45GOpuatSWA0/edit), [Ausentismo/cobertura TM](https://docs.google.com/spreadsheets/d/1snoTvzWTOu5rzjBuc816rrgE1gPW-QyOB-52rpa4m0A/edit), [Plantilla RH](https://docs.google.com/spreadsheets/d/1LmhklivJtNZalWqC6y2YS3xMIZ-JmgTnL8RluwrmA6U/edit), [Plantilla coordinación](https://docs.google.com/spreadsheets/d/1eG3RVI1ANJwoZamooTrq8eVG7huxjVrKKwopmUisHUs/edit), [Hoja enlace](https://docs.google.com/spreadsheets/d/10rvcT3qAbquyNcgF59MTtQDEDhpJRlOWFI5nh4AW-I8/edit). **Sin transferir nombres ni RUD reales** a tests.
- NestJS documentación oficial verificada en noviembre 2026: https://docs.nestjs.com/first-steps ; https://docs.nestjs.com/openapi/introduction ; https://docs.nestjs.com/techniques/configuration ; https://docs.nestjs.com/application/validation ; https://docs.nestjs.com/websockets/gateways ; https://docs.nestjs.com/techniques/database .

**Diferencias que NO debemos ocultar:**

1. Las hojas consultadas pertenecen al Hospital Civil **Fray Antonio Alcalde**; otras conversaciones han mencionado **Juan I. Menchaca**. Toda importación requiere hospital de origen explícito; nunca asumir equivalencia.
2. El documento académico contiene propuestas normativas/disciplinarias, oficios y semáforos que **no están implementados en las 51 tablas**; requieren validación Jurídico/Jefatura e incluso una revisión de su enfoque de derechos, atribuciones y uso de información clínica.
3. Un documento de requerimientos académico menciona catálogo de ocho incidencias, pero el módulo de SIGE-H se definió como **catálogo extensible**. No codificar ocho valores estáticos a nivel DTO.
4. Los balances antiguos tratan ausencia de “A” como falta automática; la decisión posterior de SIGE-H es **PENDIENTE hasta validación**.
5. Los documentos plantean umbrales de desempeño (pase de lista, sync offline, tiempo de eventual y PDF) como **metas de verificación**, no resultados reales medidos.
6. El SQL contiene restricciones e inmutabilidad, pero las reglas de ámbito, autorización, idempotencia robusta y no doble asignación necesitan implementación y/o migración V2.
7. No automatizar sanciones, elegibilidad laboral por puntaje ni delegaciones clínicas solo por categoría nominal o umbrales NOM supuestos. Hacer revisión institucional antes de activar dichas funciones.

**Definición de primera entrega tangible:** `GET /api/v1/health` con BD QA, `GET /api/v1/hospitales` con filtro por ámbito (protegido), `GET /api/v1/empleados` con paginación y permisos, Swagger verdadero `/docs`, Angular con login/listados y Android leyendo lista de turnos. Si falta autenticación real, iniciar solo health en entorno de QA; **no** publicar datos laborales de muestra en APIs abiertas.

