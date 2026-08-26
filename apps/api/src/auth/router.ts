import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { ContextRequest } from "../middleware/requestContext.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { PublicAuthError, type AuthService } from "./service.js";

const registrationSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160),
    email: z.email().max(320),
    password: z.string().min(12).max(128)
  })
  .strict();

const loginSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(128)
  })
  .strict();

const refreshSchema = z.object({ refreshToken: z.string().max(512) }).strict();
const logoutSchema = z.object({ refreshToken: z.string().max(512).optional() }).strict();

function contextFrom(request: ContextRequest) {
  if (!request.requestContext) throw new Error("Request context is unavailable");
  return request.requestContext;
}

function noStore(response: Response) {
  response.set("Cache-Control", "no-store");
  response.set("Pragma", "no-cache");
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

export function createAuthRouter(authService: AuthService) {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (request, response) => {
      const input = registrationSchema.parse(request.body);
      const session = await authService.registerSender(
        input,
        contextFrom(request as ContextRequest)
      );
      noStore(response);
      response.status(201).json(session);
    })
  );

  router.post(
    "/login",
    asyncHandler(async (request, response) => {
      const input = loginSchema.parse(request.body);
      const session = await authService.login(
        input,
        contextFrom(request as ContextRequest)
      );
      noStore(response);
      response.json(session);
    })
  );

  router.post(
    "/refresh",
    asyncHandler(async (request, response) => {
      const input = refreshSchema.parse(request.body);
      const session = await authService.refresh(
        input.refreshToken,
        contextFrom(request as ContextRequest)
      );
      noStore(response);
      response.json(session);
    })
  );

  router.post(
    "/logout",
    asyncHandler(async (request, response) => {
      const input = logoutSchema.parse(request.body || {});
      await authService.logout(
        input.refreshToken,
        contextFrom(request as ContextRequest)
      );
      noStore(response);
      response.status(204).send();
    })
  );

  router.post(
    "/logout-all",
    requireAuth(authService),
    asyncHandler(async (request, response) => {
      const authRequest = request as AuthRequest & ContextRequest;
      if (!authRequest.auth) throw new Error("Auth principal is unavailable");
      await authService.logoutAll(authRequest.auth, contextFrom(authRequest));
      noStore(response);
      response.status(204).send();
    })
  );

  return router;
}

export function createMeHandler(authService: AuthService) {
  return [
    requireAuth(authService),
    asyncHandler(async (request, response) => {
      const authRequest = request as AuthRequest;
      if (!authRequest.auth) throw new Error("Auth principal is unavailable");
      const user = await authService.me(authRequest.auth);
      noStore(response);
      response.json(user);
    })
  ] as const;
}

export function authErrorResponse(
  error: unknown,
  response: Response
): boolean {
  if (error instanceof PublicAuthError) {
    noStore(response);
    if (error.retryAfterSeconds) {
      response.set("Retry-After", String(error.retryAfterSeconds));
    }
    response.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return true;
  }
  if (error instanceof z.ZodError) {
    noStore(response);
    response.status(400).json({
      error: { code: "INVALID_REQUEST", message: "Invalid request" }
    });
    return true;
  }
  return false;
}
