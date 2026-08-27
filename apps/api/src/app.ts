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

export interface AppDependencies {
  authService?: AuthService;
  transferWorkflowService?: TransferWorkflowService;
  quoteWorkflowService?: QuoteWorkflowService;
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

  if (dependencies.authService) {
    app.use("/auth", createAuthRouter(dependencies.authService));
    app.get("/me", ...createMeHandler(dependencies.authService));
    if (dependencies.transferWorkflowService) {
      app.use(
        "/recipients",
        createRecipientsRouter(
          dependencies.authService,
          dependencies.transferWorkflowService
        )
      );
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
