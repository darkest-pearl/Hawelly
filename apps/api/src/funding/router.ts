import { pipeline } from "node:stream/promises";
import { Router, type Request } from "express";
import { Capability, Role } from "../generated/prisma/enums.js";
import type { AuthService } from "../auth/service.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { requireAuth, requireCapability, requireRole, type AuthRequest } from "../middleware/auth.js";
import { uuidSchema } from "../transfers/validation.js";
import type { FundingWorkflowService } from "./service.js";
import {
  confirmFundsSchema,
  publishFundingInstructionSchema,
  reviewFundingProofSchema,
  signedEvidenceQuerySchema,
  submitFundingProofSchema
} from "./validation.js";

function principalFrom(request: Request) {
  const principal = (request as AuthRequest).auth;
  if (!principal) throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required");
  return principal;
}

function idsFrom(request: Request) {
  return {
    transferId: uuidSchema.parse(request.params.id),
    proofId: request.params.proofId ? uuidSchema.parse(request.params.proofId) : undefined
  };
}

export function createEvidenceRouter(workflow: FundingWorkflowService) {
  const router = Router();
  router.put("/uploads/:proofId", asyncHandler(async (request, response) => {
    const proofId = uuidSchema.parse(request.params.proofId);
    const query = signedEvidenceQuerySchema.parse(request.query);
    const contentType = request.headers["content-type"]?.trim() || "";
    const proof = await workflow.completeUpload(
      proofId,
      query.expires,
      query.signature,
      contentType,
      request as unknown as AsyncIterable<Uint8Array>,
      contextFrom(request)
    );
    noStore(response);
    response.json({ proof });
  }));
  router.get("/downloads/:proofId", asyncHandler(async (request, response) => {
    const proofId = uuidSchema.parse(request.params.proofId);
    const query = signedEvidenceQuerySchema.parse(request.query);
    const evidence = await workflow.openDownload(proofId, query.expires, query.signature);
    response.set({
      "Cache-Control": "private, no-store",
      "Content-Type": evidence.contentType,
      "Content-Length": String(evidence.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`,
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff"
    });
    await pipeline(evidence.stream, response);
  }));
  return router;
}

export function createSenderFundingRouter(authService: AuthService, workflow: FundingWorkflowService) {
  const router = Router();
  router.use(requireAuth(authService), requireRole(Role.SENDER));
  router.get("/:id/funding", asyncHandler(async (request, response) => {
    const result = await workflow.getSenderFunding(principalFrom(request), idsFrom(request).transferId);
    noStore(response);
    response.json(result);
  }));
  router.post("/:id/funding-proofs", asyncHandler(async (request, response) => {
    const result = await workflow.submitProof(principalFrom(request), idsFrom(request).transferId, submitFundingProofSchema.parse(request.body), contextFrom(request));
    noStore(response);
    response.status(201).json(result);
  }));
  router.post("/:id/funding-proofs/:proofId/read-url", asyncHandler(async (request, response) => {
    const { transferId, proofId } = idsFrom(request);
    const result = await workflow.issueReadUrl(principalFrom(request), transferId, proofId!, "sender", contextFrom(request));
    noStore(response);
    response.json(result);
  }));
  return router;
}

export function createOperationsFundingRouter(authService: AuthService, workflow: FundingWorkflowService) {
  const router = Router();
  const guard = [
    requireAuth(authService),
    requireCapability(Capability.FUNDING_REVIEW, async (request, principal) => {
      await workflow.auditCapabilityDenied(principal, contextFrom(request));
    })
  ] as const;
  router.get("/funding-templates", ...guard, asyncHandler(async (request, response) => {
    const templates = await workflow.listTemplates(principalFrom(request));
    noStore(response);
    response.json({ templates });
  }));
  router.get("/transfers/:id/funding", ...guard, asyncHandler(async (request, response) => {
    const result = await workflow.getOperationsFunding(principalFrom(request), idsFrom(request).transferId);
    noStore(response);
    response.json(result);
  }));
  router.post("/transfers/:id/funding-instruction", ...guard, asyncHandler(async (request, response) => {
    const instruction = await workflow.publishInstruction(principalFrom(request), idsFrom(request).transferId, publishFundingInstructionSchema.parse(request.body), contextFrom(request));
    noStore(response);
    response.status(201).json({ instruction });
  }));
  router.post("/transfers/:id/funding-proofs/:proofId/read-url", ...guard, asyncHandler(async (request, response) => {
    const { transferId, proofId } = idsFrom(request);
    const result = await workflow.issueReadUrl(principalFrom(request), transferId, proofId!, "operations", contextFrom(request));
    noStore(response);
    response.json(result);
  }));
  router.post("/transfers/:id/funding-proofs/:proofId/review", ...guard, asyncHandler(async (request, response) => {
    const { transferId, proofId } = idsFrom(request);
    const input = reviewFundingProofSchema.parse(request.body);
    const result = await workflow.reviewProof(principalFrom(request), transferId, proofId!, input.decision, input.reason, contextFrom(request));
    noStore(response);
    response.json(result);
  }));
  router.post("/transfers/:id/funds-confirmation", ...guard, asyncHandler(async (request, response) => {
    const input = confirmFundsSchema.parse(request.body);
    const result = await workflow.confirmFunds(principalFrom(request), idsFrom(request).transferId, input.proofId, input.reason, contextFrom(request));
    noStore(response);
    response.json(result);
  }));
  return router;
}
