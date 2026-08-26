-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SENDER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StaffOperationalStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('TRANSFER_REVIEW', 'QUOTE_MANAGE', 'FUNDING_REVIEW', 'PAYOUT_MANAGE', 'TRANSFER_HOLD', 'DISPUTE_MANAGE', 'REFUND_MANAGE', 'ASSOCIATE_VIEW', 'ASSOCIATE_MANAGE', 'STAFF_MANAGE', 'CONFIG_MANAGE', 'AUDIT_VIEW');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('API', 'WEB', 'ANDROID', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'INFO');

-- CreateEnum
CREATE TYPE "RateLimitScope" AS ENUM ('IP', 'IP_IDENTIFIER', 'IDENTIFIER', 'REGISTRATION_IP');

-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'ROTATED', 'REPLAY_DETECTED', 'USER_INACTIVE', 'ROLE_CHANGED', 'ADMIN_REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'CASH_PICKUP', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "FundingMethod" AS ENUM ('BANK_TRANSFER', 'CASH_HANDOFF', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'NEEDS_INFO', 'QUOTING', 'QUOTED', 'QUOTE_ACCEPTED', 'FUNDING_PENDING', 'FUNDING_SUBMITTED', 'FUNDS_CONFIRMED', 'PAYOUT_IN_PROGRESS', 'PAYOUT_REPORTED', 'CONFIRMATION_PENDING', 'COMPLETED', 'ON_HOLD', 'DECLINED', 'QUOTE_EXPIRED', 'CANCELLED', 'DISPUTED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EvidenceReviewStatus" AS ENUM ('SUBMITTED', 'NEEDS_RESUBMISSION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssociateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PayoutCaseStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'REPORTED', 'COMPLETED', 'ON_HOLD', 'FAILED');

-- CreateEnum
CREATE TYPE "ConfirmationSource" AS ENUM ('STAFF', 'SENDER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "operationalStatus" "StaffOperationalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCapabilityGrant" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "capability" "Capability" NOT NULL,
    "grantedByUserId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "reason" VARCHAR(500),

    CONSTRAINT "StaffCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "clientSource" "ActivitySource" NOT NULL DEFAULT 'API',
    "ipHash" CHAR(64),
    "userAgentHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "replayDetectedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" "SessionRevocationReason",
    "replacedById" UUID,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "keyHash" CHAR(64) NOT NULL,
    "scope" "RateLimitScope" NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" UUID NOT NULL,
    "ownerSenderId" UUID NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "phone" VARCHAR(32),
    "payoutMethod" "PayoutMethod" NOT NULL,
    "payoutDetails" JSONB NOT NULL,
    "address" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferRequest" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "originCountry" CHAR(2) NOT NULL,
    "destinationCountry" CHAR(2) NOT NULL,
    "sendAmountMinor" BIGINT NOT NULL,
    "sendCurrency" CHAR(3) NOT NULL,
    "requestedPayoutMethod" "PayoutMethod" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "quoteDueAt" TIMESTAMPTZ(3) NOT NULL,
    "senderNote" VARCHAR(1000),
    "acceptedQuoteId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sendAmountMinor" BIGINT NOT NULL,
    "sendCurrency" CHAR(3) NOT NULL,
    "feeAmountMinor" BIGINT NOT NULL,
    "feeBreakdown" JSONB,
    "effectiveRate" DECIMAL(24,12) NOT NULL,
    "receiveAmountMinor" BIGINT NOT NULL,
    "receiveCurrency" CHAR(3) NOT NULL,
    "expectedDeliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByStaffId" UUID NOT NULL,
    "senderFacingNote" VARCHAR(500),
    "internalNote" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingInstruction" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "acceptedQuoteId" UUID NOT NULL,
    "method" "FundingMethod" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payeeName" VARCHAR(160) NOT NULL,
    "provider" VARCHAR(160),
    "accountReference" VARCHAR(500),
    "senderReference" VARCHAR(100) NOT NULL,
    "instructions" VARCHAR(2000) NOT NULL,
    "validUntil" TIMESTAMPTZ(3),
    "publishedByStaffId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingProof" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "submittedBySenderId" UUID NOT NULL,
    "reference" VARCHAR(200),
    "amountMinor" BIGINT,
    "currency" CHAR(3),
    "transferredAt" TIMESTAMPTZ(3),
    "storageObjectKey" VARCHAR(1000),
    "originalFilename" VARCHAR(255),
    "contentType" VARCHAR(160),
    "sizeBytes" BIGINT,
    "status" "EvidenceReviewStatus" NOT NULL DEFAULT 'SUBMITTED',
    "senderNote" VARCHAR(1000),
    "reviewedByStaffId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssociateContact" (
    "id" UUID NOT NULL,
    "businessName" VARCHAR(200) NOT NULL,
    "countries" TEXT[],
    "cities" TEXT[],
    "payoutMethods" "PayoutMethod"[],
    "currencies" TEXT[],
    "contactChannels" JSONB NOT NULL,
    "trustNotes" VARCHAR(2000),
    "status" "AssociateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByStaffId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssociateContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutCase" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "staffOwnerId" UUID NOT NULL,
    "associateContactId" UUID,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payoutMethod" "PayoutMethod" NOT NULL,
    "expectedBy" TIMESTAMPTZ(3) NOT NULL,
    "status" "PayoutCaseStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" VARCHAR(300),
    "internalNote" VARCHAR(2000),
    "senderFacingNote" VARCHAR(500),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PayoutCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutEvidence" (
    "id" UUID NOT NULL,
    "payoutCaseId" UUID NOT NULL,
    "storageObjectKey" VARCHAR(1000),
    "externalReference" VARCHAR(300),
    "originalFilename" VARCHAR(255),
    "contentType" VARCHAR(160),
    "sizeBytes" BIGINT,
    "createdByStaffId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferConfirmation" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "source" "ConfirmationSource" NOT NULL,
    "actorUserId" UUID,
    "referenceIdentity" VARCHAR(300),
    "note" VARCHAR(1000),
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNote" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "authorStaffId" UUID NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "openedByUserId" UUID NOT NULL,
    "assignedToStaffId" UUID,
    "category" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" VARCHAR(4000),
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" "Role",
    "source" "ActivitySource" NOT NULL DEFAULT 'API',
    "requestId" VARCHAR(100) NOT NULL,
    "actionType" VARCHAR(120) NOT NULL,
    "outcome" "ActivityOutcome" NOT NULL,
    "entityType" VARCHAR(120),
    "entityId" VARCHAR(120),
    "previousState" JSONB,
    "nextState" JSONB,
    "reason" VARCHAR(1000),
    "errorCode" VARCHAR(120),
    "metadata" JSONB NOT NULL,
    "ipHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminConfiguration" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "quoteSlaMinutes" INTEGER NOT NULL,
    "quoteDefaultExpiryMinutes" INTEGER NOT NULL,
    "supportedOriginCountries" TEXT[],
    "supportedDestinationCountries" TEXT[],
    "supportedCurrencies" TEXT[],
    "payoutMethodsByDestination" JSONB NOT NULL,
    "evidenceMaxSizeBytes" BIGINT NOT NULL,
    "evidenceAllowedContentTypes" TEXT[],
    "createdByAdminId" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffCapabilityGrant_staffUserId_capability_revokedAt_idx" ON "StaffCapabilityGrant"("staffUserId", "capability", "revokedAt");

-- CreateIndex
CREATE INDEX "StaffCapabilityGrant_grantedAt_idx" ON "StaffCapabilityGrant"("grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_replacedById_key" ON "AuthSession"("replacedById");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_familyId_revokedAt_idx" ON "AuthSession"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_absoluteExpiresAt_idx" ON "AuthSession"("absoluteExpiresAt");

-- CreateIndex
CREATE INDEX "AuthRateLimit_blockedUntil_idx" ON "AuthRateLimit"("blockedUntil");

-- CreateIndex
CREATE INDEX "AuthRateLimit_updatedAt_idx" ON "AuthRateLimit"("updatedAt");

-- CreateIndex
CREATE INDEX "Recipient_ownerSenderId_createdAt_idx" ON "Recipient"("ownerSenderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_id_ownerSenderId_key" ON "Recipient"("id", "ownerSenderId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRequest_reference_key" ON "TransferRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRequest_acceptedQuoteId_key" ON "TransferRequest"("acceptedQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRequest_id_senderId_key" ON "TransferRequest"("id", "senderId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRequest_acceptedQuoteId_id_key" ON "TransferRequest"("acceptedQuoteId", "id");

-- CreateIndex
CREATE INDEX "TransferRequest_senderId_createdAt_idx" ON "TransferRequest"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "TransferRequest_status_quoteDueAt_idx" ON "TransferRequest"("status", "quoteDueAt");

-- CreateIndex
CREATE INDEX "TransferRequest_recipientId_idx" ON "TransferRequest"("recipientId");

-- CreateIndex
CREATE INDEX "Quote_transferRequestId_status_idx" ON "Quote"("transferRequestId", "status");

-- CreateIndex
CREATE INDEX "Quote_status_expiresAt_idx" ON "Quote"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_transferRequestId_version_key" ON "Quote"("transferRequestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_id_transferRequestId_key" ON "Quote"("id", "transferRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingInstruction_acceptedQuoteId_key" ON "FundingInstruction"("acceptedQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingInstruction_acceptedQuoteId_transferRequestId_key" ON "FundingInstruction"("acceptedQuoteId", "transferRequestId");

-- CreateIndex
CREATE INDEX "FundingInstruction_transferRequestId_idx" ON "FundingInstruction"("transferRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingProof_storageObjectKey_key" ON "FundingProof"("storageObjectKey");

-- CreateIndex
CREATE INDEX "FundingProof_transferRequestId_status_idx" ON "FundingProof"("transferRequestId", "status");

-- CreateIndex
CREATE INDEX "FundingProof_submittedBySenderId_createdAt_idx" ON "FundingProof"("submittedBySenderId", "createdAt");

-- CreateIndex
CREATE INDEX "AssociateContact_status_idx" ON "AssociateContact"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutCase_transferRequestId_key" ON "PayoutCase"("transferRequestId");

-- CreateIndex
CREATE INDEX "PayoutCase_status_expectedBy_idx" ON "PayoutCase"("status", "expectedBy");

-- CreateIndex
CREATE INDEX "PayoutCase_staffOwnerId_status_idx" ON "PayoutCase"("staffOwnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutEvidence_storageObjectKey_key" ON "PayoutEvidence"("storageObjectKey");

-- CreateIndex
CREATE INDEX "PayoutEvidence_payoutCaseId_createdAt_idx" ON "PayoutEvidence"("payoutCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "TransferConfirmation_confirmedAt_idx" ON "TransferConfirmation"("confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransferConfirmation_transferRequestId_source_key" ON "TransferConfirmation"("transferRequestId", "source");

-- CreateIndex
CREATE INDEX "StaffNote_transferRequestId_createdAt_idx" ON "StaffNote"("transferRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_transferRequestId_status_idx" ON "Dispute"("transferRequestId", "status");

-- CreateIndex
CREATE INDEX "Dispute_assignedToStaffId_status_idx" ON "Dispute"("assignedToStaffId", "status");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_actorUserId_createdAt_idx" ON "ActivityEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_actionType_createdAt_idx" ON "ActivityEvent"("actionType", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_entityType_entityId_createdAt_idx" ON "ActivityEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_requestId_createdAt_idx" ON "ActivityEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminConfiguration_version_key" ON "AdminConfiguration"("version");

-- CreateIndex
CREATE INDEX "AdminConfiguration_active_version_idx" ON "AdminConfiguration"("active", "version");

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCapabilityGrant" ADD CONSTRAINT "StaffCapabilityGrant_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCapabilityGrant" ADD CONSTRAINT "StaffCapabilityGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCapabilityGrant" ADD CONSTRAINT "StaffCapabilityGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_ownerSenderId_fkey" FOREIGN KEY ("ownerSenderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_recipientId_senderId_fkey" FOREIGN KEY ("recipientId", "senderId") REFERENCES "Recipient"("id", "ownerSenderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_acceptedQuoteId_id_fkey" FOREIGN KEY ("acceptedQuoteId", "id") REFERENCES "Quote"("id", "transferRequestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstruction" ADD CONSTRAINT "FundingInstruction_transfer_accepted_fkey" FOREIGN KEY ("acceptedQuoteId", "transferRequestId") REFERENCES "TransferRequest"("acceptedQuoteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstruction" ADD CONSTRAINT "FundingInstruction_quote_transfer_fkey" FOREIGN KEY ("acceptedQuoteId", "transferRequestId") REFERENCES "Quote"("id", "transferRequestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstruction" ADD CONSTRAINT "FundingInstruction_publishedByStaffId_fkey" FOREIGN KEY ("publishedByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingProof" ADD CONSTRAINT "FundingProof_transferRequestId_submittedBySenderId_fkey" FOREIGN KEY ("transferRequestId", "submittedBySenderId") REFERENCES "TransferRequest"("id", "senderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingProof" ADD CONSTRAINT "FundingProof_submittedBySenderId_fkey" FOREIGN KEY ("submittedBySenderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingProof" ADD CONSTRAINT "FundingProof_reviewedByStaffId_fkey" FOREIGN KEY ("reviewedByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociateContact" ADD CONSTRAINT "AssociateContact_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutCase" ADD CONSTRAINT "PayoutCase_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutCase" ADD CONSTRAINT "PayoutCase_staffOwnerId_fkey" FOREIGN KEY ("staffOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutCase" ADD CONSTRAINT "PayoutCase_associateContactId_fkey" FOREIGN KEY ("associateContactId") REFERENCES "AssociateContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEvidence" ADD CONSTRAINT "PayoutEvidence_payoutCaseId_fkey" FOREIGN KEY ("payoutCaseId") REFERENCES "PayoutCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEvidence" ADD CONSTRAINT "PayoutEvidence_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferConfirmation" ADD CONSTRAINT "TransferConfirmation_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferConfirmation" ADD CONSTRAINT "TransferConfirmation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedToStaffId_fkey" FOREIGN KEY ("assignedToStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hawelly integrity constraints that Prisma cannot express directly.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_normalized_check"
  CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "User_password_hash_nonempty_check"
  CHECK (length("passwordHash") > 0);

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_expiry_order_check"
  CHECK ("expiresAt" > "createdAt" AND "absoluteExpiresAt" >= "expiresAt");

ALTER TABLE "AuthRateLimit"
  ADD CONSTRAINT "AuthRateLimit_failure_count_check"
  CHECK ("failureCount" >= 0);

ALTER TABLE "TransferRequest"
  ADD CONSTRAINT "TransferRequest_send_amount_positive_check"
  CHECK ("sendAmountMinor" > 0),
  ADD CONSTRAINT "TransferRequest_country_currency_format_check"
  CHECK (
    "originCountry" = upper("originCountry") AND
    "destinationCountry" = upper("destinationCountry") AND
    "sendCurrency" = upper("sendCurrency")
  );

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_amounts_rate_expiry_check"
  CHECK (
    "version" > 0 AND
    "sendAmountMinor" > 0 AND
    "feeAmountMinor" >= 0 AND
    "receiveAmountMinor" > 0 AND
    "effectiveRate" > 0 AND
    "expiresAt" > "createdAt" AND
    "sendCurrency" = upper("sendCurrency") AND
    "receiveCurrency" = upper("receiveCurrency")
  ),
  ADD CONSTRAINT "Quote_accepted_timestamp_check"
  CHECK ("status" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL);

ALTER TABLE "FundingInstruction"
  ADD CONSTRAINT "FundingInstruction_amount_currency_check"
  CHECK ("amountMinor" > 0 AND "currency" = upper("currency"));

ALTER TABLE "FundingProof"
  ADD CONSTRAINT "FundingProof_amount_size_check"
  CHECK (
    ("amountMinor" IS NULL OR "amountMinor" > 0) AND
    ("sizeBytes" IS NULL OR "sizeBytes" >= 0) AND
    ("currency" IS NULL OR "currency" = upper("currency"))
  );

ALTER TABLE "PayoutCase"
  ADD CONSTRAINT "PayoutCase_amount_currency_check"
  CHECK ("amountMinor" > 0 AND "currency" = upper("currency"));

ALTER TABLE "PayoutEvidence"
  ADD CONSTRAINT "PayoutEvidence_size_check"
  CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0);

CREATE UNIQUE INDEX "StaffCapabilityGrant_active_unique"
  ON "StaffCapabilityGrant"("staffUserId", "capability")
  WHERE "revokedAt" IS NULL;

CREATE UNIQUE INDEX "Quote_one_sent_per_transfer"
  ON "Quote"("transferRequestId")
  WHERE "status" = 'SENT';

CREATE UNIQUE INDEX "Quote_one_accepted_per_transfer"
  ON "Quote"("transferRequestId")
  WHERE "status" = 'ACCEPTED';

CREATE UNIQUE INDEX "AdminConfiguration_one_active"
  ON "AdminConfiguration"("active")
  WHERE "active" = true;

CREATE OR REPLACE FUNCTION hawelly_protect_accepted_quote()
RETURNS trigger AS $$
BEGIN
  IF (
    OLD."status" = 'ACCEPTED' OR
    OLD."acceptedAt" IS NOT NULL OR
    EXISTS (
      SELECT 1
      FROM "TransferRequest"
      WHERE "acceptedQuoteId" = OLD."id"
    )
  ) AND (
    NEW."transferRequestId" IS DISTINCT FROM OLD."transferRequestId" OR
    NEW."version" IS DISTINCT FROM OLD."version" OR
    NEW."sendAmountMinor" IS DISTINCT FROM OLD."sendAmountMinor" OR
    NEW."sendCurrency" IS DISTINCT FROM OLD."sendCurrency" OR
    NEW."feeAmountMinor" IS DISTINCT FROM OLD."feeAmountMinor" OR
    NEW."feeBreakdown" IS DISTINCT FROM OLD."feeBreakdown" OR
    NEW."effectiveRate" IS DISTINCT FROM OLD."effectiveRate" OR
    NEW."receiveAmountMinor" IS DISTINCT FROM OLD."receiveAmountMinor" OR
    NEW."receiveCurrency" IS DISTINCT FROM OLD."receiveCurrency" OR
    NEW."expectedDeliveryAt" IS DISTINCT FROM OLD."expectedDeliveryAt" OR
    NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
  ) THEN
    RAISE EXCEPTION 'accepted quote financial fields are immutable';
  END IF;
  IF OLD."acceptedAt" IS NOT NULL AND
     NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" THEN
    RAISE EXCEPTION 'accepted quote acceptance timestamp is immutable';
  END IF;
  IF OLD."acceptedAt" IS NOT NULL AND
     NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'accepted quote status is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Quote_accepted_financial_immutability"
BEFORE UPDATE ON "Quote"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_accepted_quote();

CREATE OR REPLACE FUNCTION hawelly_validate_transfer_accepted_quote()
RETURNS trigger AS $$
BEGIN
  IF NEW."acceptedQuoteId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Quote"
    WHERE "id" = NEW."acceptedQuoteId"
      AND "transferRequestId" = NEW."id"
      AND "status" = 'ACCEPTED'
      AND "acceptedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'accepted quote must be accepted and belong to the transfer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransferRequest_validate_accepted_quote"
BEFORE INSERT OR UPDATE OF "acceptedQuoteId" ON "TransferRequest"
FOR EACH ROW EXECUTE FUNCTION hawelly_validate_transfer_accepted_quote();

CREATE OR REPLACE FUNCTION hawelly_protect_activity_event()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityEvent_no_update"
BEFORE UPDATE ON "ActivityEvent"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_activity_event();

CREATE TRIGGER "ActivityEvent_no_delete"
BEFORE DELETE ON "ActivityEvent"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_activity_event();
