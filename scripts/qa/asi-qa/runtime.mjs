// Test adapter only: real controllers/services/PostgresService, no AppModule or QA factory.
// No default runtime destination is changed. A verified, newly created manifest is required.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
export async function runtime({ root, pool, identity, enabled = true }) {
  if (
    identity.port !== 5432 ||
    !identity.host ||
    identity.host === "127.0.0.1" ||
    identity.database !== "sigeh_qa" ||
    !identity.cluster ||
    identity.cluster === "7707094012630982690" ||
    !identity.containerId ||
    !identity.verified
  )
    throw Error("EPHEMERAL_RUNTIME_IDENTITY_REJECTED");
  const require = createRequire(path.join(root, "apps/api/package.json"));
  const { Test } = await import(require.resolve("@nestjs/testing"));
  const { Global, Module, ValidationPipe, Logger } = await import(
    require.resolve("@nestjs/common")
  );
  const { ConfigService } = await import(require.resolve("@nestjs/config"));
  const dist = async (p) =>
    import(pathToFileURL(path.join(root, "apps/api/dist", p)).href);
  const { PG_POOL, PostgresService } = await dist(
    "database/postgres.service.js",
  );
  const { IamModule } = await dist("modules/iam/iam.module.js");
  const { AsistenciaModule } = await dist(
    "modules/asistencia/asistencia.module.js",
  );
  const { HealthModule } = await dist("modules/health/health.module.js");
  const { PasswordHasher } = await dist(
    "modules/iam/domain/password-hasher.js",
  );
  const { API_CONTRACT } = await dist("config/api-contract.js");
  const config = new ConfigService({
    NODE_ENV: "test",
    DB_HOST: identity.host,
    DB_PORT: identity.port,
    DB_NAME: identity.database,
    DB_USER: "sigeh_qa_app",
    DB_SCHEMA: "sigeh",
    ASISTENCIA_ENABLED: enabled ? "true" : "false",
    IAM_V2_ENABLED: "true",
    L3A_READS_ENABLED: "false",
    JWT_SECRET: randomBytes(48).toString("base64url"),
    IAM_JWT_ISSUER: "urn:sigeh:asi-qa",
    IAM_JWT_AUDIENCE: "sigeh-asi-qa",
    IAM_ACCESS_SECONDS: 300,
    IAM_IP_ATTEMPTS: 120,
    SWAGGER_ENABLED: "false",
  });
  class EphemeralProviders {}
  Global()(EphemeralProviders);
  Module({
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: PG_POOL, useValue: pool },
      PostgresService,
    ],
    exports: [ConfigService, PG_POOL, PostgresService],
  })(EphemeralProviders);
  Logger.overrideLogger(false);
  const module = await Test.createTestingModule({
    imports: [EphemeralProviders, IamModule, AsistenciaModule, HealthModule],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_CONTRACT.globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  await app.init();
  return { app, hasher: app.get(PasswordHasher) };
}
