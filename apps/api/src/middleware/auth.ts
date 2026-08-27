import type { NextFunction, Request, Response } from "express";
import { Role, type Capability } from "../generated/prisma/enums.js";
import type { AuthPrincipal, AuthService } from "../auth/service.js";

export interface AuthRequest extends Request {
  auth?: AuthPrincipal;
}

function readBearerToken(request: Request) {
  const authorization = request.header("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export function requireAuth(authService: AuthService) {
  return async (request: AuthRequest, _response: Response, next: NextFunction) => {
    try {
      const token = readBearerToken(request);
      if (!token) throw new Error("Missing bearer token");
      request.auth = await authService.authenticate(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: readonly Role[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      response.set("Cache-Control", "no-store");
      response.status(401).json({
        error: { code: "AUTH_REQUIRED", message: "Authentication required" }
      });
      return;
    }
    if (!roles.includes(request.auth.role)) {
      response.set("Cache-Control", "no-store");
      response.status(403).json({
        error: { code: "FORBIDDEN", message: "Forbidden" }
      });
      return;
    }
    next();
  };
}

export function requireCapability(
  capability: Capability,
  onDenied?: (
    request: AuthRequest,
    principal: AuthPrincipal
  ) => Promise<void>
) {
  return async (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      response.set("Cache-Control", "no-store");
      response.status(401).json({
        error: { code: "AUTH_REQUIRED", message: "Authentication required" }
      });
      return;
    }
    if (request.auth.role === Role.ADMIN) {
      next();
      return;
    }
    if (
      request.auth.role !== Role.STAFF ||
      !request.auth.capabilities.includes(capability)
    ) {
      try {
        await onDenied?.(request, request.auth);
      } catch {
        // Authorization remains fail-closed even if denial telemetry is unavailable.
      }
      response.set("Cache-Control", "no-store");
      response.status(403).json({
        error: { code: "FORBIDDEN", message: "Forbidden" }
      });
      return;
    }
    next();
  };
}
