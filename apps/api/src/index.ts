import "dotenv/config";
import { AuthService } from "./auth/service.js";
import { resolveAuthConfig } from "./auth/config.js";
import { createApp } from "./app.js";
import { resolveRuntimeConfig } from "./config.js";
import { createPrismaClient, validateDatabaseUrl } from "./db/prisma.js";
import { resolveTransferWorkflowConfig } from "./transfers/config.js";
import { TransferWorkflowService } from "./transfers/service.js";
import { resolveQuoteWorkflowConfig } from "./quotes/config.js";
import { QuoteWorkflowService } from "./quotes/service.js";
import { resolveFundingWorkflowConfig } from "./funding/config.js";
import { FundingWorkflowService } from "./funding/service.js";
import { LocalEvidenceStorage } from "./funding/storage.js";
import { PayoutWorkflowService } from "./payout/service.js";
import { ResolutionWorkflowService } from "./resolution/service.js";
import { AdminWorkflowService } from "./admin/service.js";
import { DatabaseRuntimeConfigurationProvider } from "./admin/runtimeConfiguration.js";

const config = resolveRuntimeConfig();
const database = createPrismaClient(validateDatabaseUrl(process.env.DATABASE_URL));
const authService = new AuthService(database, resolveAuthConfig());
const runtimeConfiguration = new DatabaseRuntimeConfigurationProvider(database);
const transferWorkflowService = new TransferWorkflowService(
  database,
  resolveTransferWorkflowConfig(),
  undefined,
  undefined,
  runtimeConfiguration
);
const quoteWorkflowService = new QuoteWorkflowService(
  database,
  resolveQuoteWorkflowConfig(),
  undefined,
  runtimeConfiguration
);
const fundingConfig = resolveFundingWorkflowConfig();
const evidenceStorage = new LocalEvidenceStorage(
  fundingConfig.storageRoot,
  fundingConfig.maximumProofBytes
);
const fundingWorkflowService = new FundingWorkflowService(
  database,
  evidenceStorage,
  fundingConfig,
  undefined,
  runtimeConfiguration
);
const payoutWorkflowService = new PayoutWorkflowService(
  database,
  evidenceStorage,
  fundingConfig,
  undefined,
  runtimeConfiguration
);
const resolutionWorkflowService = new ResolutionWorkflowService(database);
const adminWorkflowService = new AdminWorkflowService(database, fundingConfig);
await fundingWorkflowService.initializeStorage();
const app = createApp(config, {
  authService,
  transferWorkflowService,
  quoteWorkflowService,
  fundingWorkflowService,
  payoutWorkflowService,
  resolutionWorkflowService,
  adminWorkflowService,
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
