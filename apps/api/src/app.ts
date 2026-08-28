import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
import { authErrorResponse, createAuthRouter, createMeHandler } from "./auth/router.js";
import type { AuthService } from "./auth/service.js";
import {
  resolveRuntimeConfig,
  type RuntimeConfig
} from "./config.js";
import { createRequestContextMiddleware } from "./middleware/requestContext.js";
import { apiErrorResponse } from "./http/errors.js";
import {
  createOperationsTransfersRouter,
  createRecipientsRouter,
  createTransfersRouter
} from "./transfers/router.js";
import type { TransferWorkflowService } from "./transfers/service.js";
import { createOperationsQuotesRouter, createSenderQuotesRouter } from "./quotes/router.js";
import type { QuoteWorkflowService } from "./quotes/service.js";
import {
  createEvidenceRouter,
  createOperationsFundingRouter,
  createSenderFundingRouter
} from "./funding/router.js";
import type { FundingWorkflowService } from "./funding/service.js";
import {
  createOperationsPayoutRouter,
  createPayoutEvidenceRouter,
  createSenderPayoutRouter
} from "./payout/router.js";
import type { PayoutWorkflowService } from "./payout/service.js";
import { createOperationsResolutionRouter, createSenderResolutionRouter } from "./resolution/router.js";
import type { ResolutionWorkflowService } from "./resolution/service.js";
import { createAdminRouter } from "./admin/router.js";
import type { AdminWorkflowService } from "./admin/service.js";

export interface AppDependencies {
  authService?: AuthService;
  transferWorkflowService?: TransferWorkflowService;
  quoteWorkflowService?: QuoteWorkflowService;
  fundingWorkflowService?: FundingWorkflowService;
  payoutWorkflowService?: PayoutWorkflowService;
  resolutionWorkflowService?: ResolutionWorkflowService;
  adminWorkflowService?: AdminWorkflowService;
  readinessCheck?: () => Promise<void>;
}

const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
};

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next
) => {
  void _next;
  if (authErrorResponse(error, response)) return;
  if (apiErrorResponse(error, response)) return;
  response.status(500).json({ error: "Internal server error" });
};

export function createApp(
  config: RuntimeConfig = resolveRuntimeConfig(),
  dependencies: AppDependencies = {}
) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(createRequestContextMiddleware(config.trustedBffAddresses));
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed"));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ ok: true, service: "hawelly-api" });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await dependencies.readinessCheck?.();
      response.set("Cache-Control", "no-store");
      response.json({ ok: true, service: "hawelly-api", readiness: "ready" });
    } catch {
      response.set("Cache-Control", "no-store");
      response.status(503).json({
        ok: false,
        service: "hawelly-api",
        readiness: "unavailable"
      });
    }
  });

  app.get("/health/storage", async (_request, response) => {
    try {
      if (!dependencies.fundingWorkflowService) throw new Error("Storage is unavailable");
      await dependencies.fundingWorkflowService.storageHealthcheck();
      response.set("Cache-Control", "no-store");
      response.json({ ok: true, service: "hawelly-api", storage: "ready" });
    } catch {
      response.set("Cache-Control", "no-store");
      response.status(503).json({ ok: false, service: "hawelly-api", storage: "unavailable" });
    }
  });

  app.get("/app-updates/android", (request, response) => {
    const rawVersionCode = request.query.versionCode;
    if (
      typeof rawVersionCode !== "string" ||
      !/^\d+$/.test(rawVersionCode) ||
      !Number.isSafeInteger(Number(rawVersionCode)) ||
      Number(rawVersionCode) < 1
    ) {
      response.set("Cache-Control", "no-store");
      response.status(400).json({
        error: { code: "INVALID_VERSION_CODE", message: "A valid Android version code is required" }
      });
      return;
    }
    const versionCode = Number(rawVersionCode);
    const update = config.androidUpdate;
    response.set("Cache-Control", "no-store");
    response.json({
      platform: "android",
      latestVersionCode: update.latestVersionCode,
      latestVersionName: update.latestVersionName,
      minimumSupportedVersionCode: update.minimumSupportedVersionCode,
      updateAvailable: versionCode < update.latestVersionCode,
      updateRequired: versionCode < update.minimumSupportedVersionCode,
      downloadUrl: update.downloadUrl,
      sha256: update.sha256,
      releaseNotes: update.releaseNotes
    });
  });

  if (dependencies.fundingWorkflowService) {
    app.use("/evidence", createEvidenceRouter(dependencies.fundingWorkflowService));
  }
  if (dependencies.payoutWorkflowService) {
    app.use("/evidence", createPayoutEvidenceRouter(dependencies.payoutWorkflowService));
  }

  if (dependencies.authService) {
    app.use("/auth", createAuthRouter(dependencies.authService));
    app.get("/me", ...createMeHandler(dependencies.authService));
    if (dependencies.adminWorkflowService) {
      app.use("/admin", createAdminRouter(dependencies.authService, dependencies.adminWorkflowService));
    }
    if (dependencies.transferWorkflowService) {
      app.use(
        "/recipients",
        createRecipientsRouter(
          dependencies.authService,
          dependencies.transferWorkflowService
        )
      );
      if (dependencies.fundingWorkflowService) {
        app.use(
          "/transfers",
          createSenderFundingRouter(
            dependencies.authService,
            dependencies.fundingWorkflowService
          )
        );
        app.use(
          "/operations",
          createOperationsFundingRouter(
            dependencies.authService,
            dependencies.fundingWorkflowService
          )
        );
      }
      if (dependencies.payoutWorkflowService) {
        app.use(
          "/transfers",
          createSenderPayoutRouter(dependencies.authService, dependencies.payoutWorkflowService)
        );
        app.use(
          "/operations",
          createOperationsPayoutRouter(dependencies.authService, dependencies.payoutWorkflowService)
        );
      }
      if (dependencies.resolutionWorkflowService) {
        app.use("/transfers", createSenderResolutionRouter(dependencies.authService, dependencies.resolutionWorkflowService));
        app.use("/operations", createOperationsResolutionRouter(dependencies.authService, dependencies.resolutionWorkflowService));
      }
      app.use(
        "/transfers",
        createTransfersRouter(
          dependencies.authService,
          dependencies.transferWorkflowService
        )
      );
      app.use(
        "/operations/transfers",
        createOperationsTransfersRouter(
          dependencies.authService,
          dependencies.transferWorkflowService
        )
      );
      if (dependencies.quoteWorkflowService) {
        app.use(
          "/transfers",
          createSenderQuotesRouter(
            dependencies.authService,
            dependencies.quoteWorkflowService
          )
        );
        app.use(
          "/operations/transfers",
          createOperationsQuotesRouter(
            dependencies.authService,
            dependencies.quoteWorkflowService
          )
        );
      }
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
