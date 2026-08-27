import { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ActivitySource } from "../generated/prisma/enums.js";

export interface RequestContext {
  requestId: string;
  source: ActivitySource;
  ipAddress: string;
  rateLimitAddress?: string;
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

function resolveRateLimitAddress(
  request: Request,
  source: ActivitySource,
  trustedBffAddresses: readonly string[]
) {
  const peerAddress = request.ip || "unknown";
  const identity = request.header("x-hawelly-bff-rate-limit-id") || "";
  const clientId = identity.startsWith("client:") ? identity.slice(7) : "";
  const clientIp = identity.startsWith("ip:") ? identity.slice(3) : "";
  if (
    source === ActivitySource.WEB &&
    trustedBffAddresses.includes(peerAddress)
  ) {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        clientId
      )
    ) {
      return `web-client:${clientId.toLowerCase()}`;
    }
    if (isIP(clientIp)) return `web-ip:${clientIp}`;
  }
  return peerAddress;
}

export function createRequestContextMiddleware(
  trustedBffAddresses: readonly string[] = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ]
) {
  return (request: ContextRequest, response: Response, next: NextFunction) => {
    const source = resolveSource(request);
    const context: RequestContext = {
      requestId: normalizeRequestId(
        request.header("x-request-id") || request.header("x-correlation-id")
      ),
      source,
      ipAddress: request.ip || "unknown",
      rateLimitAddress: resolveRateLimitAddress(
        request,
        source,
        trustedBffAddresses
      ),
      userAgent: String(request.header("user-agent") || "").slice(0, 500)
    };
    request.requestContext = context;
    response.set("X-Request-Id", context.requestId);
    contextStorage.run(context, next);
  };
}

export const requestContextMiddleware = createRequestContextMiddleware();

export function getRequestContext() {
  return contextStorage.getStore();
}
