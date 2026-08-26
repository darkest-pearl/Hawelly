import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const envPath = fileURLToPath(new URL(".env", import.meta.url));
const parsed = loadEnv({ path: envPath }).parsed;
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  parsed?.DATABASE_URL?.trim() ||
  "postgresql://hawelly:local-only@127.0.0.1:5432/hawelly?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: databaseUrl
  }
});
