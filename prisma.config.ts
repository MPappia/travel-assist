import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Valeur par défaut : `prisma generate` (postinstall) doit fonctionner avant la création du .env.
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
