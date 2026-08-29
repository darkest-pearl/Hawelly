import type { Response } from "express";

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown, response: Response): boolean {
  if (!(error instanceof PublicApiError)) return false;
  response.set("Cache-Control", "no-store");
  if (error.retryAfterSeconds) {
    response.set("Retry-After", String(error.retryAfterSeconds));
  }
  response.status(error.status).json({
    error: { code: error.code, message: error.message }
  });
  return true;
}

export function requestBodyErrorResponse(error: unknown, response: Response) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; type?: unknown };
  if (candidate.status === 413 || candidate.type === "entity.too.large") {
    response.set("Cache-Control", "no-store");
    response.status(413).json({
      error: { code: "BODY_TOO_LARGE", message: "Request body is too large" }
    });
    return true;
  }
  if (candidate.status === 400 && candidate.type === "entity.parse.failed") {
    response.set("Cache-Control", "no-store");
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" }
    });
    return true;
  }
  return false;
}
