import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ActivitySource } from "../generated/prisma/enums.js";

export interface RequestContext {
  requestId: string;
  source: ActivitySource;
  ipAddress: string;
  userAgent: string;
}

export interface ContextRequest extends Request {
  requestContext?: RequestContext;
}

const contextStorage = new AsyncLocalStorage<RequestContext>();

function normalizeRequestId(value: unknown) {
  if (typeof value !== "string") return randomUUID();
  const normalized = value.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 100);
  return normalized || randomUUID();
}

function resolveSource(request: Request) {
  const source = String(request.header("x-client-source") || "").toUpperCase();
  if (source === ActivitySource.WEB) return ActivitySource.WEB;
  if (source === ActivitySource.ANDROID) return ActivitySource.ANDROID;
  return ActivitySource.API;
}

export function requestContextMiddleware(
  request: ContextRequest,
  response: Response,
  next: NextFunction
) {
  const context: RequestContext = {
    requestId: normalizeRequestId(
      request.header("x-request-id") || request.header("x-correlation-id")
    ),
    source: resolveSource(request),
    ipAddress: request.ip || "unknown",
    userAgent: String(request.header("user-agent") || "").slice(0, 500)
  };
  request.requestContext = context;
  response.set("X-Request-Id", context.requestId);
  contextStorage.run(context, next);
}

export function getRequestContext() {
  return contextStorage.getStore();
}
