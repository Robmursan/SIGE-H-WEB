import { defineConfig } from 'vitest/config';

// Opt-in BEFORE importing AppModule (its bootstrap performs database reads).
// Destination/credentials must be supplied by the operator; never load .env here.
if (
  process.env.SIGEH_QA_INTEGRATION !== '1' ||
  process.env.NODE_ENV !== 'test' ||
  !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST ?? '') ||
  process.env.DB_NAME !== 'sigeh_qa' ||
  process.env.DB_PORT !== '55432' ||
  process.env.DB_USER !== 'sigeh_qa_app' ||
  !process.env.DB_PASSWORD
) {
  throw new Error(
    'Integración bloqueada: requiere SIGEH_QA_INTEGRATION=1, NODE_ENV=test, host local, puerto 55432, DB_NAME=sigeh_qa y DB_USER=sigeh_qa_app con credencial externa. El preflight posterior comprueba privilegios efectivos; no autoriza escrituras.',
  );
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.e2e-spec.ts'],
    globalSetup: ['./test/integration/qa-preflight.ts'],
  },
});
