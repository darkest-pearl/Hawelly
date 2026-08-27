import { Router, type Request } from "express";
import { Capability, Role } from "../generated/prisma/enums.js";
import type { AuthService } from "../auth/service.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { requireAuth, requireCapability, requireRole, type AuthRequest } from "../middleware/auth.js";
import { uuidSchema } from "../transfers/validation.js";
import type { QuoteWorkflowService } from "./service.js";
import { createQuoteSchema, quoteDecisionSchema } from "./validation.js";

function principalFrom(request: Request) {
  const principal = (request as AuthRequest).auth;
  if (!principal) throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required");
  return principal;
}

function idsFrom(request: Request) {
  return {
    transferId: uuidSchema.parse(request.params.id),
    quoteId: request.params.quoteId ? uuidSchema.parse(request.params.quoteId) : undefined
  };
}

export function createOperationsQuotesRouter(authService: AuthService, workflow: QuoteWorkflowService) {
  const router = Router();
  router.use(
    requireAuth(authService),
    requireCapability(Capability.TRANSFER_REVIEW, async (request, principal) => {
      await workflow.auditCapabilityDenied(
        principal,
        Capability.TRANSFER_REVIEW,
        contextFrom(request)
      );
    }),
    requireCapability(Capability.QUOTE_MANAGE, async (request, principal) => {
      await workflow.auditCapabilityDenied(
        principal,
        Capability.QUOTE_MANAGE,
        contextFrom(request)
      );
    })
  );
  router.get("/:id/quotes", asyncHandler(async (request, response) => {
    const quotes = await workflow.listOperationsQuotes(principalFrom(request), idsFrom(request).transferId);
    noStore(response);
    response.json({ quotes });
  }));
  router.post("/:id/quotes", asyncHandler(async (request, response) => {
    const quote = await workflow.createDraft(principalFrom(request), idsFrom(request).transferId, createQuoteSchema.parse(request.body), contextFrom(request));
    noStore(response);
    response.status(201).json({ quote });
  }));
  router.post("/:id/quotes/:quoteId/send", asyncHandler(async (request, response) => {
    const { transferId, quoteId } = idsFrom(request);
    const quote = await workflow.sendDraft(principalFrom(request), transferId, quoteId!, contextFrom(request));
    noStore(response);
    response.json({ quote });
  }));
  return router;
}

export function createSenderQuotesRouter(authService: AuthService, workflow: QuoteWorkflowService) {
  const router = Router();
  router.use(requireAuth(authService), requireRole(Role.SENDER));
  router.get("/:id/quotes", asyncHandler(async (request, response) => {
    const quotes = await workflow.listSenderQuotes(principalFrom(request), idsFrom(request).transferId, contextFrom(request));
    noStore(response);
    response.json({ quotes });
  }));
  router.post("/:id/quotes/:quoteId/decision", asyncHandler(async (request, response) => {
    const { transferId, quoteId } = idsFrom(request);
    const input = quoteDecisionSchema.parse(request.body);
    const result = await workflow.decide(principalFrom(request), transferId, quoteId!, input.decision, input.reason, contextFrom(request));
    noStore(response);
    response.json(result);
  }));
  return router;
}
