import type { NextFunction, Request, Response } from "express";
import type { ContextRequest, RequestContext } from "../middleware/requestContext.js";

export function contextFrom(request: Request): RequestContext {
  const context = (request as ContextRequest).requestContext;
  if (!context) throw new Error("Request context is unavailable");
  return context;
}

export function noStore(response: Response) {
  response.set("Cache-Control", "no-store");
  response.set("Pragma", "no-cache");
}

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

