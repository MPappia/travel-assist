// Recrée une base SQLite vierge dédiée aux tests end-to-end puis démarre le serveur Next.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const port = process.env.PORT ?? "3100";
const mock = `http://127.0.0.1:${process.env.MOCK_PORT ?? "3101"}`;
const env = {
  ...process.env,
  DATABASE_URL: "file:./prisma/e2e.db",
  // Services externes remplacés par tests/e2e/mock-services.mjs
  ORS_BASE_URL: mock,
  PHOTON_BASE_URL: mock,
  ORS_API_KEY: "test-key",
  SERPAPI_BASE_URL: mock,
  SERPAPI_KEY: "test-serpapi-key",
  // URL injectée dans le bookmarklet ; pas de LLM pendant les tests
  APP_URL: `http://localhost:${port}`,
  LLM_BASE_URL: "",
  LLM_MODEL: "",
};

for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`prisma/e2e.db${suffix}`, { force: true });
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync(`npx next start -p ${port}`, { stdio: "inherit", env });
