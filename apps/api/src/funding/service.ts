import { randomUUID } from "node:crypto";
import { ActivityOutcome, Capability, EvidenceReviewStatus, QuoteStatus, Role, TransferStatus } from "../generated/prisma/enums.js";
import { writeActivity } from "../auth/audit.js";
import type { AuthPrincipal } from "../auth/service.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import { assertTransferTransition } from "../transfers/state.js";
import type { FundingWorkflowConfig } from "./config.js";
import { EvidenceUrlSigner, type EvidenceOperation } from "./storage.js";
import type { LocalEvidenceStorage } from "./storage.js";
import type { RuntimeConfigurationProvider } from "../admin/runtimeConfiguration.js";

const MAX_BIGINT = 9_223_372_036_854_775_807n;

interface PublishInstructionInput {
  templateId: string;
  senderReference: string;
  validUntil?: string | undefined;
}

interface SubmitProofInput {
  reference?: string | undefined;
  amountMinor?: string | undefined;
  currency?: string | undefined;
  transferredAt?: string | undefined;
  senderNote?: string | undefined;
  attachment?: { filename: string; contentType: string; sizeBytes: number } | undefined;
}

type ReviewDecision = "VERIFY" | "REQUEST_RESUBMISSION" | "REJECT";

function requireOperations(principal: AuthPrincipal) {
  if (principal.role !== Role.STAFF && principal.role !== Role.ADMIN) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function requireSender(principal: AuthPrincipal) {
  if (principal.role !== Role.SENDER) throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
}

function instructionProjection(instruction: {
  id: string;
  transferRequestId: string;
  acceptedQuoteId: string;
  method: string;
  amountMinor: bigint;
  currency: string;
  payeeName: string;
  provider: string | null;
  accountReference: string | null;
  senderReference: string;
  instructions: string;
  validUntil: Date | null;
  createdAt: Date;
}) {
  return {
    id: instruction.id,
    transferRequestId: instruction.transferRequestId,
    acceptedQuoteId: instruction.acceptedQuoteId,
    method: instruction.method,
    amountMinor: instruction.amountMinor.toString(),
    currency: instruction.currency,
    payeeName: instruction.payeeName,
    provider: instruction.provider,
    accountReference: instruction.accountReference,
    senderReference: instruction.senderReference,
    instructions: instruction.instructions,
    validUntil: instruction.validUntil?.toISOString() ?? null,
    createdAt: instruction.createdAt.toISOString()
  };
}

function proofProjection(proof: {
  id: string;
  transferRequestId: string;
  reference: string | null;
  amountMinor: bigint | null;
  currency: string | null;
  transferredAt: Date | null;
  storageObjectKey: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: bigint | null;
  uploadExpiresAt: Date | null;
  uploadedAt: Date | null;
  status: EvidenceReviewStatus;
  senderNote: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  createdAt: Date;
}) {
  return {
    id: proof.id,
    transferRequestId: proof.transferRequestId,
    reference: proof.reference,
    amountMinor: proof.amountMinor?.toString() ?? null,
    currency: proof.currency,
    transferredAt: proof.transferredAt?.toISOString() ?? null,
    hasAttachment: Boolean(proof.storageObjectKey && proof.uploadedAt),
    originalFilename: proof.originalFilename,
    contentType: proof.contentType,
    sizeBytes: proof.sizeBytes?.toString() ?? null,
    uploadExpiresAt: proof.uploadExpiresAt?.toISOString() ?? null,
    uploadedAt: proof.uploadedAt?.toISOString() ?? null,
    status: proof.status,
    senderNote: proof.senderNote,
    reviewedAt: proof.reviewedAt?.toISOString() ?? null,
    reviewReason: proof.reviewReason,
    createdAt: proof.createdAt.toISOString()
  };
}

function extensionFor(contentType: string, filename: string) {
  const normalized = filename.toLowerCase();
  if (contentType === "application/pdf" && normalized.endsWith(".pdf")) return "pdf";
  if (contentType === "image/png" && normalized.endsWith(".png")) return "png";
  if (contentType === "image/jpeg" && (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg"))) return "jpg";
  throw new PublicApiError(400, "INVALID_EVIDENCE_FILE", "Evidence filename does not match its content type");
}

export class FundingWorkflowService {
  private readonly signer: EvidenceUrlSigner;

  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly storage: LocalEvidenceStorage,
    private readonly config: FundingWorkflowConfig,
    private readonly clock: () => Date = () => new Date(),
    private readonly runtimeConfiguration?: RuntimeConfigurationProvider
  ) {
    this.signer = new EvidenceUrlSigner(config.signingSecret);
  }

  async initializeStorage() {
    await this.storage.initialize();
  }

  async storageHealthcheck() {
    await this.storage.healthcheck();
  }

  async auditCapabilityDenied(principal: AuthPrincipal, context: RequestContext) {
    await writeActivity(this.database, {
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: context.source,
      requestId: context.requestId,
      actionType: "AUTHORIZATION_DENIED",
      outcome: ActivityOutcome.DENIED,
      entityType: "Capability",
      entityId: Capability.FUNDING_REVIEW,
      errorCode: "FORBIDDEN"
    });
  }

  async listTemplates(principal: AuthPrincipal) {
    requireOperations(principal);
    const templates = await this.database.fundingInstructionTemplate.findMany({
      where: { active: true },
      orderBy: [{ currency: "asc" }, { name: "asc" }]
    });
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      method: template.method,
      currency: template.currency,
      payeeName: template.payeeName,
      provider: template.provider,
      accountReference: template.accountReference,
      instructions: template.instructions
    }));
  }

  async publishInstruction(principal: AuthPrincipal, transferId: string, input: PublishInstructionInput, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil <= now) throw new PublicApiError(400, "INVALID_FUNDING_EXPIRY", "Funding instructions must remain valid in the future");
    const instruction = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { acceptedQuote: true } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (transfer.status !== TransferStatus.QUOTE_ACCEPTED || !transfer.acceptedQuoteId || !transfer.acceptedQuote || transfer.acceptedQuote.status !== QuoteStatus.ACCEPTED) {
        throw new PublicApiError(409, "FUNDING_NOT_READY", "Transfer is not ready for funding instructions");
      }
      const existing = await transaction.fundingInstruction.findFirst({ where: { transferRequestId: transferId }, select: { id: true } });
      if (existing) throw new PublicApiError(409, "FUNDING_INSTRUCTION_EXISTS", "Funding instructions have already been published");
      const template = await transaction.fundingInstructionTemplate.findUnique({ where: { id: input.templateId } });
      if (!template || !template.active || template.currency !== transfer.acceptedQuote.sendCurrency) {
        throw new PublicApiError(400, "FUNDING_TEMPLATE_UNAVAILABLE", "Funding template is unavailable for this transfer");
      }
      const created = await transaction.fundingInstruction.create({
        data: {
          transferRequestId: transfer.id,
          acceptedQuoteId: transfer.acceptedQuoteId,
          templateId: template.id,
          method: template.method,
          amountMinor: transfer.acceptedQuote.sendAmountMinor,
          currency: transfer.acceptedQuote.sendCurrency,
          payeeName: template.payeeName,
          provider: template.provider,
          accountReference: template.accountReference,
          senderReference: input.senderReference,
          instructions: template.instructions,
          validUntil,
          publishedByStaffId: principal.userId,
          createdAt: now
        }
      });
      assertTransferTransition(transfer.status, TransferStatus.FUNDING_PENDING);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.FUNDING_PENDING } });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "FUNDING_INSTRUCTIONS_PUBLISHED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest",
        entityId: transfer.id,
        previousState: { status: TransferStatus.QUOTE_ACCEPTED },
        nextState: { status: TransferStatus.FUNDING_PENDING },
        metadata: { instructionId: created.id, templateId: template.id }
      });
      return created;
    });
    return instructionProjection(instruction);
  }

  async getSenderFunding(principal: AuthPrincipal, transferId: string) {
    requireSender(principal);
    const transfer = await this.database.transferRequest.findUnique({
      where: { id_senderId: { id: transferId, senderId: principal.userId } },
      include: { fundingInstructions: true, fundingProofs: { orderBy: { createdAt: "desc" } } }
    });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    const instruction = transfer.fundingInstructions[0];
    return {
      transferStatus: transfer.status,
      instruction: instruction ? instructionProjection(instruction) : null,
      proofs: transfer.fundingProofs.map(proofProjection)
    };
  }

  async getOperationsFunding(principal: AuthPrincipal, transferId: string) {
    requireOperations(principal);
    const transfer = await this.database.transferRequest.findUnique({
      where: { id: transferId },
      include: { fundingInstructions: true, fundingProofs: { orderBy: { createdAt: "desc" } } }
    });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    const instruction = transfer.fundingInstructions[0];
    return {
      transferStatus: transfer.status,
      instruction: instruction ? instructionProjection(instruction) : null,
      proofs: transfer.fundingProofs.map(proofProjection)
    };
  }

  private signedUrl(operation: EvidenceOperation, proofId: string, objectKey: string, expires: number) {
    const route = operation === "upload" ? "uploads" : "downloads";
    const url = new URL(`/evidence/${route}/${proofId}`, this.config.publicBaseUrl);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", this.signer.sign(operation, proofId, objectKey, expires));
    return url.toString();
  }

  async submitProof(principal: AuthPrincipal, transferId: string, input: SubmitProofInput, context: RequestContext) {
    requireSender(principal);
    const now = this.clock();
    const amount = input.amountMinor ? BigInt(input.amountMinor) : null;
    if (amount && amount > MAX_BIGINT) throw new PublicApiError(400, "INVALID_FUNDING_AMOUNT", "Funding amount is invalid");
    let attachment: { filename: string; contentType: string; sizeBytes: number; extension: string } | null = null;
    if (input.attachment) {
      const activeConfiguration = await this.runtimeConfiguration?.getActive();
      const allowedContentTypes = activeConfiguration?.evidenceAllowedContentTypes ?? this.config.allowedContentTypes;
      const maximumProofBytes = activeConfiguration?.evidenceMaxSizeBytes ?? this.config.maximumProofBytes;
      if (!allowedContentTypes.includes(input.attachment.contentType)) {
        throw new PublicApiError(400, "INVALID_EVIDENCE_TYPE", "Evidence file type is not allowed");
      }
      if (input.attachment.sizeBytes > maximumProofBytes) {
        throw new PublicApiError(413, "EVIDENCE_TOO_LARGE", "Evidence file is too large");
      }
      attachment = { ...input.attachment, extension: extensionFor(input.attachment.contentType, input.attachment.filename) };
    }
    const proofId = randomUUID();
    const uploadExpiresAt = attachment ? new Date(now.getTime() + this.config.signedUrlTtlSeconds * 1_000) : null;
    const objectKey = attachment ? `transfers/${transferId}/funding/${proofId}/proof.${attachment.extension}` : null;

    const result = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid AND "senderId" = ${principal.userId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id_senderId: { id: transferId, senderId: principal.userId } }, include: { fundingInstructions: true } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (transfer.status !== TransferStatus.FUNDING_PENDING || !transfer.fundingInstructions[0]) {
        throw new PublicApiError(409, "FUNDING_PROOF_NOT_ALLOWED", "Transfer is not awaiting funding proof");
      }
      const stale = await transaction.fundingProof.findMany({
        where: { transferRequestId: transferId, status: EvidenceReviewStatus.PENDING_UPLOAD, uploadExpiresAt: { lte: now } },
        select: { id: true, storageObjectKey: true }
      });
      if (stale.length) await transaction.fundingProof.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
      const active = await transaction.fundingProof.findFirst({ where: { transferRequestId: transferId, status: { in: [EvidenceReviewStatus.PENDING_UPLOAD, EvidenceReviewStatus.SUBMITTED] } } });
      if (active) throw new PublicApiError(409, "FUNDING_PROOF_ACTIVE", "A funding proof is already awaiting upload or review");
      const instruction = transfer.fundingInstructions[0];
      if (input.currency && input.currency !== instruction.currency) {
        throw new PublicApiError(400, "FUNDING_CURRENCY_MISMATCH", "Funding proof currency must match the instruction");
      }
      const created = await transaction.fundingProof.create({
        data: {
          id: proofId,
          transferRequestId: transferId,
          submittedBySenderId: principal.userId,
          reference: input.reference ?? null,
          amountMinor: amount,
          currency: input.currency ?? null,
          transferredAt: input.transferredAt ? new Date(input.transferredAt) : null,
          storageObjectKey: objectKey,
          originalFilename: attachment?.filename ?? null,
          contentType: attachment?.contentType ?? null,
          sizeBytes: attachment ? BigInt(attachment.sizeBytes) : null,
          uploadExpiresAt,
          status: attachment ? EvidenceReviewStatus.PENDING_UPLOAD : EvidenceReviewStatus.SUBMITTED,
          senderNote: input.senderNote ?? null,
          createdAt: now
        }
      });
      if (!attachment) {
        assertTransferTransition(transfer.status, TransferStatus.FUNDING_SUBMITTED);
        await transaction.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.FUNDING_SUBMITTED } });
      }
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: attachment ? "FUNDING_PROOF_UPLOAD_REQUESTED" : "FUNDING_PROOF_SUBMITTED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: attachment ? "FundingProof" : "TransferRequest",
        entityId: attachment ? created.id : transferId,
        nextState: { status: created.status },
        metadata: { transferRequestId: transferId, hasAttachment: Boolean(attachment) }
      });
      return { created, staleObjectKeys: stale.flatMap((item) => item.storageObjectKey ? [item.storageObjectKey] : []) };
    });
    await Promise.all(result.staleObjectKeys.map((key) => this.storage.deleteObject(key)));
    return {
      proof: proofProjection(result.created),
      upload: attachment && objectKey && uploadExpiresAt ? {
        url: this.signedUrl("upload", proofId, objectKey, Math.floor(uploadExpiresAt.getTime() / 1_000)),
        method: "PUT",
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        expiresAt: uploadExpiresAt.toISOString()
      } : null
    };
  }

  async completeUpload(
    proofId: string,
    expires: number,
    signature: string,
    contentType: string,
    source: AsyncIterable<Uint8Array>,
    context: RequestContext
  ) {
    const now = this.clock();
    const proof = await this.database.fundingProof.findUnique({ where: { id: proofId } });
    if (!proof || !proof.storageObjectKey || !proof.contentType || !proof.sizeBytes || !proof.uploadExpiresAt) {
      throw new PublicApiError(404, "EVIDENCE_UPLOAD_NOT_FOUND", "Evidence upload was not found");
    }
    if (proof.status !== EvidenceReviewStatus.PENDING_UPLOAD) throw new PublicApiError(409, "EVIDENCE_UPLOAD_CLOSED", "Evidence upload is no longer available");
    if (expires <= Math.floor(now.getTime() / 1_000) || proof.uploadExpiresAt <= now) {
      throw new PublicApiError(410, "EVIDENCE_URL_EXPIRED", "Evidence upload URL has expired");
    }
    if (!this.signer.verify("upload", proof.id, proof.storageObjectKey, expires, signature)) {
      throw new PublicApiError(403, "INVALID_EVIDENCE_SIGNATURE", "Evidence upload URL is invalid");
    }
    if (contentType !== proof.contentType) throw new PublicApiError(400, "EVIDENCE_TYPE_MISMATCH", "Evidence content type does not match the upload request");
    const expectedBytes = Number(proof.sizeBytes);
    await this.storage.writeObject(proof.storageObjectKey, source, expectedBytes, contentType);
    try {
      const updated = await this.database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${proof.transferRequestId}::uuid FOR UPDATE`;
        const current = await transaction.fundingProof.findUnique({ where: { id: proof.id } });
        const transfer = await transaction.transferRequest.findUnique({ where: { id: proof.transferRequestId } });
        if (!current || current.status !== EvidenceReviewStatus.PENDING_UPLOAD || !transfer || transfer.status !== TransferStatus.FUNDING_PENDING) {
          throw new PublicApiError(409, "EVIDENCE_UPLOAD_CLOSED", "Evidence upload is no longer available");
        }
        const submitted = await transaction.fundingProof.update({
          where: { id: proof.id },
          data: { status: EvidenceReviewStatus.SUBMITTED, uploadedAt: now }
        });
        assertTransferTransition(transfer.status, TransferStatus.FUNDING_SUBMITTED);
        await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.FUNDING_SUBMITTED } });
        await writeActivity(transaction, {
          actorUserId: proof.submittedBySenderId,
          actorRole: Role.SENDER,
          source: context.source,
          requestId: context.requestId,
          actionType: "FUNDING_PROOF_SUBMITTED",
          outcome: ActivityOutcome.SUCCESS,
          entityType: "TransferRequest",
          entityId: proof.transferRequestId,
          previousState: { status: EvidenceReviewStatus.PENDING_UPLOAD },
          nextState: { status: EvidenceReviewStatus.SUBMITTED },
          metadata: { transferRequestId: proof.transferRequestId, proofId: proof.id, sizeBytes: expectedBytes }
        });
        return submitted;
      });
      return proofProjection(updated);
    } catch (error) {
      await this.storage.deleteObject(proof.storageObjectKey);
      throw error;
    }
  }

  async issueReadUrl(principal: AuthPrincipal, transferId: string, proofId: string, audience: "sender" | "operations", context: RequestContext) {
    if (audience === "sender") requireSender(principal); else requireOperations(principal);
    const proof = await this.database.fundingProof.findFirst({
      where: {
        id: proofId,
        transferRequestId: transferId,
        ...(audience === "sender" ? { submittedBySenderId: principal.userId } : {})
      }
    });
    if (!proof || !proof.storageObjectKey || !proof.uploadedAt || proof.status === EvidenceReviewStatus.PENDING_UPLOAD) {
      throw new PublicApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file was not found");
    }
    const expires = Math.floor((this.clock().getTime() + this.config.signedUrlTtlSeconds * 1_000) / 1_000);
    await writeActivity(this.database, {
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: context.source,
      requestId: context.requestId,
      actionType: "EVIDENCE_READ_URL_ISSUED",
      outcome: ActivityOutcome.SUCCESS,
      entityType: "FundingProof",
      entityId: proof.id,
      metadata: { transferRequestId: transferId, audience }
    });
    return { url: this.signedUrl("download", proof.id, proof.storageObjectKey, expires), expiresAt: new Date(expires * 1_000).toISOString() };
  }

  async openDownload(proofId: string, expires: number, signature: string) {
    const proof = await this.database.fundingProof.findUnique({ where: { id: proofId } });
    if (!proof || !proof.storageObjectKey || !proof.uploadedAt || !proof.contentType || !proof.originalFilename || proof.status === EvidenceReviewStatus.PENDING_UPLOAD) {
      throw new PublicApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file was not found");
    }
    if (expires <= Math.floor(this.clock().getTime() / 1_000)) throw new PublicApiError(410, "EVIDENCE_URL_EXPIRED", "Evidence read URL has expired");
    if (!this.signer.verify("download", proof.id, proof.storageObjectKey, expires, signature)) {
      throw new PublicApiError(403, "INVALID_EVIDENCE_SIGNATURE", "Evidence read URL is invalid");
    }
    return { ...(await this.storage.openObject(proof.storageObjectKey)), contentType: proof.contentType, filename: proof.originalFilename };
  }

  async reviewProof(principal: AuthPrincipal, transferId: string, proofId: string, decision: ReviewDecision, reason: string, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const target = decision === "VERIFY" ? EvidenceReviewStatus.VERIFIED : decision === "REQUEST_RESUBMISSION" ? EvidenceReviewStatus.NEEDS_RESUBMISSION : EvidenceReviewStatus.REJECTED;
    const result = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId } });
      const proof = await transaction.fundingProof.findFirst({ where: { id: proofId, transferRequestId: transferId } });
      if (!transfer || !proof) throw new PublicApiError(404, "FUNDING_PROOF_NOT_FOUND", "Funding proof was not found");
      if (transfer.status !== TransferStatus.FUNDING_SUBMITTED || proof.status !== EvidenceReviewStatus.SUBMITTED) {
        throw new PublicApiError(409, "FUNDING_PROOF_NOT_REVIEWABLE", "Funding proof is not awaiting review");
      }
      const reviewed = await transaction.fundingProof.update({
        where: { id: proof.id },
        data: { status: target, reviewedByStaffId: principal.userId, reviewedAt: now, reviewReason: reason }
      });
      if (target !== EvidenceReviewStatus.VERIFIED) {
        assertTransferTransition(transfer.status, TransferStatus.FUNDING_PENDING);
        await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.FUNDING_PENDING } });
      }
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: target === EvidenceReviewStatus.VERIFIED ? "FUNDING_PROOF_VERIFIED" : target === EvidenceReviewStatus.NEEDS_RESUBMISSION ? "FUNDING_PROOF_RESUBMISSION_REQUESTED" : "FUNDING_PROOF_REJECTED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest",
        entityId: transfer.id,
        previousState: { status: EvidenceReviewStatus.SUBMITTED },
        nextState: { status: target },
        reason,
        metadata: { transferRequestId: transfer.id, proofId: proof.id }
      });
      return { proof: reviewed, transferStatus: target === EvidenceReviewStatus.VERIFIED ? transfer.status : TransferStatus.FUNDING_PENDING };
    });
    return { proof: proofProjection(result.proof), transferStatus: result.transferStatus };
  }

  async confirmFunds(principal: AuthPrincipal, transferId: string, proofId: string, reason: string, context: RequestContext) {
    requireOperations(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId } });
      const proof = await transaction.fundingProof.findFirst({ where: { id: proofId, transferRequestId: transferId, status: EvidenceReviewStatus.VERIFIED } });
      if (!transfer || !proof) throw new PublicApiError(404, "VERIFIED_FUNDING_PROOF_NOT_FOUND", "Verified funding proof was not found");
      if (transfer.status !== TransferStatus.FUNDING_SUBMITTED) throw new PublicApiError(409, "FUNDS_CONFIRMATION_NOT_ALLOWED", "Transfer is not awaiting funds confirmation");
      assertTransferTransition(transfer.status, TransferStatus.FUNDS_CONFIRMED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.FUNDS_CONFIRMED } });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "FUNDS_RECEIVED_CONFIRMED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest",
        entityId: transfer.id,
        previousState: { status: TransferStatus.FUNDING_SUBMITTED },
        nextState: { status: TransferStatus.FUNDS_CONFIRMED },
        reason,
        metadata: { proofId: proof.id }
      });
      return { transferStatus: TransferStatus.FUNDS_CONFIRMED };
    });
  }
}
