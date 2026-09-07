import { Router, type Response } from "express";
import { z } from "zod";
import type { ContextRequest } from "../middleware/requestContext.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { PublicAuthError, type AuthService } from "./service.js";
import { personNameSchema } from "../validation/personName.js";

const registrationSchema = z
  .object({
    fullName: personNameSchema,
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
const profileNameSchema = z.object({ fullName: personNameSchema }).strict();
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128)
  })
  .strict();

const safeValidationMessages: Readonly<Record<string, string>> = {
  fullName: "Enter a name of 1–160 characters without control characters.",
  phone: "Use international format beginning with +, followed by 8–15 digits.",
  address: "Address must be 500 characters or fewer.",
  accountName: "Enter the account holder name.",
  bankName: "Enter the bank name.",
  accountNumber: "Enter the account number.",
  bankCode: "Check the bank code.",
  provider: "Enter the mobile-money provider.",
  city: "Enter the pickup city.",
  instructions: "Enter the payout instructions.",
  currentPassword: "Enter your current password.",
  newPassword: "Use a new password of 12–128 characters."
};

function safeValidationFields(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = [...issue.path].reverse().find((part) => typeof part === "string");
    if (typeof field === "string" && !fields[field]) {
      fields[field] = safeValidationMessages[field] ?? "Check this field.";
    }
  }
  return fields;
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

export function createUpdateMeHandler(authService: AuthService) {
  return [
    requireAuth(authService),
    asyncHandler(async (request, response) => {
      const authRequest = request as AuthRequest & ContextRequest;
      if (!authRequest.auth) throw new Error("Auth principal is unavailable");
      const { fullName } = profileNameSchema.parse(request.body);
      const user = await authService.updateFullName(
        authRequest.auth,
        fullName,
        contextFrom(authRequest)
      );
      noStore(response);
      response.json({ user });
    })
  ] as const;
}

export function createChangePasswordHandler(authService: AuthService) {
  return [
    requireAuth(authService),
    asyncHandler(async (request, response) => {
      const authRequest = request as AuthRequest & ContextRequest;
      if (!authRequest.auth) throw new Error("Auth principal is unavailable");
      const input = changePasswordSchema.parse(request.body);
      await authService.changePassword(
        authRequest.auth,
        input,
        contextFrom(authRequest)
      );
      noStore(response);
      response.status(204).send();
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
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields",
        fields: safeValidationFields(error)
      }
    });
    return true;
  }
  return false;
}
