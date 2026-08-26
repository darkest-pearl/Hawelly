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
import { requestContextMiddleware } from "./middleware/requestContext.js";

export interface AppDependencies {
  authService?: AuthService;
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
  response.status(500).json({ error: "Internal server error" });
};

export function createApp(
  config: RuntimeConfig = resolveRuntimeConfig(),
  dependencies: AppDependencies = {}
) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(requestContextMiddleware);
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
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
