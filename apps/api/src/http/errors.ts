import type { Response } from "express";

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown, response: Response): boolean {
  if (!(error instanceof PublicApiError)) return false;
  response.set("Cache-Control", "no-store");
  response.status(error.status).json({
    error: { code: error.code, message: error.message }
  });
  return true;
}

