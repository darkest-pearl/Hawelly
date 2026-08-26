import "dotenv/config";
import { AuthService } from "./auth/service.js";
import { resolveAuthConfig } from "./auth/config.js";
import { createApp } from "./app.js";
import { resolveRuntimeConfig } from "./config.js";
import { createPrismaClient, validateDatabaseUrl } from "./db/prisma.js";

const config = resolveRuntimeConfig();
const database = createPrismaClient(validateDatabaseUrl(process.env.DATABASE_URL));
const authService = new AuthService(database, resolveAuthConfig());
const app = createApp(config, {
  authService,
  readinessCheck: async () => {
    await database.$queryRaw`SELECT 1`;
  }
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Hawelly API listening on http://${config.host}:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await database.$disconnect();
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
