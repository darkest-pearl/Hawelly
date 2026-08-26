import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
import {
  resolveRuntimeConfig,
  type RuntimeConfig
} from "./config.js";

const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
};

const errorHandler: ErrorRequestHandler = (
  _error,
  _request,
  response,
  _next
) => {
  void _next;
  response.status(500).json({ error: "Internal server error" });
};

export function createApp(config: RuntimeConfig = resolveRuntimeConfig()) {
  const app = express();

  app.disable("x-powered-by");
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

  app.get("/health/ready", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ ok: true, service: "hawelly-api", readiness: "ready" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
