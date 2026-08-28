import { Router, type Request } from "express";
import { Capability, Role } from "../generated/prisma/enums.js";
import type { AuthService } from "../auth/service.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { requireAuth, requireCapability, requireRole, type AuthRequest } from "../middleware/auth.js";
import { uuidSchema } from "../transfers/validation.js";
import type { ResolutionWorkflowService } from "./service.js";
import { confirmationNoteSchema, confirmRefundSchema, dangerousCompletionSchema, openDisputeSchema, resolveDisputeSchema, startRefundSchema } from "./validation.js";

function principalFrom(request: Request) { const principal = (request as AuthRequest).auth; if (!principal) throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required"); return principal; }
function transferId(request: Request) { return uuidSchema.parse(request.params.id); }

export function createSenderResolutionRouter(auth: AuthService, workflow: ResolutionWorkflowService) {
  const router = Router(); router.use(requireAuth(auth), requireRole(Role.SENDER));
  router.get("/:id/resolution", asyncHandler(async (request, response) => { noStore(response); response.json(await workflow.getSenderState(principalFrom(request), transferId(request))); }));
  router.post("/:id/recipient-confirmation", asyncHandler(async (request, response) => { const input = confirmationNoteSchema.parse(request.body); noStore(response); response.json(await workflow.confirmRecipientReceived(principalFrom(request), transferId(request), input.note, contextFrom(request))); }));
  router.post("/:id/disputes", asyncHandler(async (request, response) => { const input = openDisputeSchema.parse(request.body); const dispute = await workflow.openDispute(principalFrom(request), transferId(request), input.category, input.reason, contextFrom(request), true); noStore(response); response.status(201).json({ dispute, transferStatus: "DISPUTED" }); }));
  return router;
}

export function createOperationsResolutionRouter(auth: AuthService, workflow: ResolutionWorkflowService) {
  const router = Router();
  const guard = (capability: Capability) => [requireAuth(auth), requireCapability(capability, async (request, principal) => workflow.auditCapabilityDenied(principal, capability, contextFrom(request)))] as const;
  const payout = guard(Capability.PAYOUT_MANAGE); const disputes = guard(Capability.DISPUTE_MANAGE); const refunds = guard(Capability.REFUND_MANAGE);
  router.get("/transfers/:id/resolution", ...guard(Capability.TRANSFER_REVIEW), asyncHandler(async (request, response) => { noStore(response); response.json(await workflow.getOperationsState(principalFrom(request), transferId(request))); }));
  router.post("/transfers/:id/confirmation-request", ...payout, asyncHandler(async (request, response) => { const input = confirmationNoteSchema.parse(request.body); noStore(response); response.json(await workflow.requestSenderConfirmation(principalFrom(request), transferId(request), input.note, contextFrom(request))); }));
  router.post("/transfers/:id/admin-completion", ...payout, asyncHandler(async (request, response) => { const input = dangerousCompletionSchema.parse(request.body); noStore(response); response.json(await workflow.completeByAdmin(principalFrom(request), transferId(request), input.reason, contextFrom(request))); }));
  router.post("/transfers/:id/disputes", ...disputes, asyncHandler(async (request, response) => { const input = openDisputeSchema.parse(request.body); const dispute = await workflow.openDispute(principalFrom(request), transferId(request), input.category, input.reason, contextFrom(request), false); noStore(response); response.status(201).json({ dispute, transferStatus: "DISPUTED" }); }));
  router.post("/transfers/:id/disputes/:disputeId/review", ...disputes, asyncHandler(async (request, response) => { noStore(response); response.json({ dispute: await workflow.takeDispute(principalFrom(request), transferId(request), uuidSchema.parse(request.params.disputeId), contextFrom(request)) }); }));
  router.post("/transfers/:id/disputes/:disputeId/resolve", ...disputes, asyncHandler(async (request, response) => { const input = resolveDisputeSchema.parse(request.body); noStore(response); response.json(await workflow.resolveDispute(principalFrom(request), transferId(request), uuidSchema.parse(request.params.disputeId), input.action, input.resolution, input.senderFacingReason, contextFrom(request))); }));
  router.post("/transfers/:id/refund", ...refunds, asyncHandler(async (request, response) => { const input = startRefundSchema.parse(request.body); noStore(response); response.status(201).json(await workflow.startRefund(principalFrom(request), transferId(request), input.reason, input.senderFacingReason, contextFrom(request))); }));
  router.post("/transfers/:id/refund-confirmation", ...refunds, asyncHandler(async (request, response) => { const input = confirmRefundSchema.parse(request.body); noStore(response); response.json(await workflow.confirmRefund(principalFrom(request), transferId(request), input.externalReference, input.refundedAt, input.reason, contextFrom(request))); }));
  return router;
}
