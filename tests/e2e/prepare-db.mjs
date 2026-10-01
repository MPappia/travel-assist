// Recrée une base SQLite vierge dédiée aux tests end-to-end puis démarre le serveur Next.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const port = process.env.PORT ?? "3100";
const env = { ...process.env, DATABASE_URL: "file:./prisma/e2e.db" };

for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`prisma/e2e.db${suffix}`, { force: true });
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync(`npx next start -p ${port}`, { stdio: "inherit", env });
