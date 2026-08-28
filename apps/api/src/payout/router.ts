import { pipeline } from "node:stream/promises";
import { Router, type Request } from "express";
import { Capability, Role } from "../generated/prisma/enums.js";
import type { AuthService } from "../auth/service.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { requireAuth, requireCapability, requireRole, type AuthRequest } from "../middleware/auth.js";
import { uuidSchema } from "../transfers/validation.js";
import { signedEvidenceQuerySchema } from "../funding/validation.js";
import type { PayoutWorkflowService } from "./service.js";
import { addPayoutEvidenceSchema, associateCreateSchema, associatePatchSchema, createPayoutCaseSchema, payoutHoldSchema, payoutReleaseSchema, reportPayoutSchema, updatePayoutCaseSchema } from "./validation.js";

function principalFrom(request: Request) {
  const principal = (request as AuthRequest).auth;
  if (!principal) throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required");
  return principal;
}

function transferIdFrom(request: Request) { return uuidSchema.parse(request.params.id); }
function evidenceIdFrom(request: Request) { return uuidSchema.parse(request.params.evidenceId); }

export function createPayoutEvidenceRouter(workflow: PayoutWorkflowService) {
  const router = Router();
  router.put("/payout-uploads/:evidenceId", asyncHandler(async (request, response) => {
    const query = signedEvidenceQuerySchema.parse(request.query);
    const result = await workflow.completeUpload(evidenceIdFrom(request), query.expires, query.signature, request.headers["content-type"]?.trim() || "", request as unknown as AsyncIterable<Uint8Array>, contextFrom(request));
    noStore(response);
    response.json({ evidence: result });
  }));
  router.get("/payout-downloads/:evidenceId", asyncHandler(async (request, response) => {
    const query = signedEvidenceQuerySchema.parse(request.query);
    const evidence = await workflow.openDownload(evidenceIdFrom(request), query.expires, query.signature);
    response.set({
      "Cache-Control": "private, no-store", "Content-Type": evidence.contentType, "Content-Length": String(evidence.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`,
      "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"
    });
    await pipeline(evidence.stream, response);
  }));
  return router;
}

export function createSenderPayoutRouter(authService: AuthService, workflow: PayoutWorkflowService) {
  const router = Router();
  router.use(requireAuth(authService), requireRole(Role.SENDER));
  router.get("/:id/payout", asyncHandler(async (request, response) => {
    const result = await workflow.getSenderPayout(principalFrom(request), transferIdFrom(request));
    noStore(response);
    response.json(result);
  }));
  return router;
}

export function createOperationsPayoutRouter(authService: AuthService, workflow: PayoutWorkflowService) {
  const router = Router();
  const capabilityGuard = (capability: Capability) => [
    requireAuth(authService),
    requireCapability(capability, async (request, principal) => workflow.auditCapabilityDenied(principal, capability, contextFrom(request)))
  ] as const;
  const payoutGuard = capabilityGuard(Capability.PAYOUT_MANAGE);
  const payoutHoldGuard = [
    ...payoutGuard,
    requireCapability(Capability.TRANSFER_HOLD, async (request, principal) => workflow.auditCapabilityDenied(principal, Capability.TRANSFER_HOLD, contextFrom(request)))
  ] as const;
  const associateViewGuard = capabilityGuard(Capability.ASSOCIATE_VIEW);
  const associateManageGuard = capabilityGuard(Capability.ASSOCIATE_MANAGE);

  router.get("/associates", ...associateViewGuard, asyncHandler(async (request, response) => {
    noStore(response); response.json({ associates: await workflow.listAssociates(principalFrom(request)) });
  }));
  router.post("/associates", ...associateManageGuard, asyncHandler(async (request, response) => {
    const associate = await workflow.createAssociate(principalFrom(request), associateCreateSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ associate });
  }));
  router.patch("/associates/:id", ...associateManageGuard, asyncHandler(async (request, response) => {
    const associate = await workflow.updateAssociate(principalFrom(request), uuidSchema.parse(request.params.id), associatePatchSchema.parse(request.body), contextFrom(request));
    noStore(response); response.json({ associate });
  }));
  router.get("/transfers/:id/payout", ...payoutGuard, asyncHandler(async (request, response) => {
    noStore(response); response.json(await workflow.getOperationsPayout(principalFrom(request), transferIdFrom(request)));
  }));
  router.post("/transfers/:id/payout-case", ...payoutGuard, asyncHandler(async (request, response) => {
    const payoutCase = await workflow.createCase(principalFrom(request), transferIdFrom(request), createPayoutCaseSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ payoutCase, transferStatus: "PAYOUT_IN_PROGRESS" });
  }));
  router.patch("/transfers/:id/payout-case", ...payoutGuard, asyncHandler(async (request, response) => {
    const payoutCase = await workflow.updateCase(principalFrom(request), transferIdFrom(request), updatePayoutCaseSchema.parse(request.body), contextFrom(request));
    noStore(response); response.json({ payoutCase });
  }));
  router.post("/transfers/:id/payout-evidence", ...payoutGuard, asyncHandler(async (request, response) => {
    const result = await workflow.addEvidence(principalFrom(request), transferIdFrom(request), addPayoutEvidenceSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json(result);
  }));
  router.post("/transfers/:id/payout-evidence/:evidenceId/read-url", ...payoutGuard, asyncHandler(async (request, response) => {
    const result = await workflow.issueReadUrl(principalFrom(request), transferIdFrom(request), evidenceIdFrom(request), contextFrom(request));
    noStore(response); response.json(result);
  }));
  router.post("/transfers/:id/payout-report", ...payoutGuard, asyncHandler(async (request, response) => {
    noStore(response); response.json(await workflow.reportPayout(principalFrom(request), transferIdFrom(request), reportPayoutSchema.parse(request.body), contextFrom(request)));
  }));
  router.post("/transfers/:id/payout-hold", ...payoutHoldGuard, asyncHandler(async (request, response) => {
    const input = payoutHoldSchema.parse(request.body); noStore(response); response.json(await workflow.hold(principalFrom(request), transferIdFrom(request), input.reason, input.senderFacingNote, contextFrom(request)));
  }));
  router.post("/transfers/:id/payout-release", ...payoutHoldGuard, asyncHandler(async (request, response) => {
    const input = payoutReleaseSchema.parse(request.body); noStore(response); response.json(await workflow.release(principalFrom(request), transferIdFrom(request), input.reason, input.senderFacingNote, contextFrom(request)));
  }));
  return router;
}
