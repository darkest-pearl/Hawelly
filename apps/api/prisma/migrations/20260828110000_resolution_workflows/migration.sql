CREATE TYPE "DisputeResolutionAction" AS ENUM ('RESUME', 'REFUND', 'COMPLETE', 'FAIL', 'REJECT');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'REFUNDED', 'FAILED');

ALTER TABLE "Dispute"
  ADD COLUMN "previousTransferStatus" "TransferStatus",
  ADD COLUMN "previousTransferStatusVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "resolutionAction" "DisputeResolutionAction";

UPDATE "Dispute" d
SET "previousTransferStatus" = t."status"
FROM "TransferRequest" t
WHERE d."transferRequestId" = t."id";

ALTER TABLE "Dispute" ALTER COLUMN "previousTransferStatus" SET NOT NULL;
ALTER TABLE "Dispute" ALTER COLUMN "previousTransferStatusVerified" SET DEFAULT TRUE;

CREATE TABLE "RefundCase" (
  "id" UUID NOT NULL,
  "transferRequestId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "reason" VARCHAR(2000) NOT NULL,
  "senderFacingReason" VARCHAR(1000) NOT NULL,
  "externalReference" VARCHAR(300),
  "initiatedByStaffId" UUID NOT NULL,
  "confirmedByAdminId" UUID,
  "initiatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundedAt" TIMESTAMPTZ(3),
  CONSTRAINT "RefundCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundCase_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "RefundCase_completion_check" CHECK (
    ("status" = 'PENDING' AND "confirmedByAdminId" IS NULL AND "refundedAt" IS NULL)
    OR ("status" = 'REFUNDED' AND "confirmedByAdminId" IS NOT NULL AND "refundedAt" IS NOT NULL AND "externalReference" IS NOT NULL)
    OR ("status" = 'FAILED' AND "refundedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "RefundCase_transferRequestId_key" ON "RefundCase"("transferRequestId");
CREATE INDEX "RefundCase_status_initiatedAt_idx" ON "RefundCase"("status", "initiatedAt");
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_initiatedByStaffId_fkey" FOREIGN KEY ("initiatedByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Dispute_one_active_per_transfer"
ON "Dispute"("transferRequestId") WHERE "status" IN ('OPEN', 'IN_REVIEW');

CREATE OR REPLACE FUNCTION protect_confirmation_history()
RETURNS trigger AS $$
DECLARE actor "User"%ROWTYPE;
DECLARE owner_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'confirmation history cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'confirmation history is immutable'; END IF;
  IF NEW."source" = 'RECIPIENT' THEN RAISE EXCEPTION 'recipient confirmation is not enabled'; END IF;
  IF NEW."actorUserId" IS NULL THEN RAISE EXCEPTION 'confirmation actor is required'; END IF;
  SELECT * INTO actor FROM "User" WHERE "id" = NEW."actorUserId";
  SELECT "senderId" INTO owner_id FROM "TransferRequest" WHERE "id" = NEW."transferRequestId";
  IF NEW."source" = 'SENDER' AND (actor."role" <> 'SENDER' OR actor."id" <> owner_id) THEN RAISE EXCEPTION 'invalid sender confirmation actor'; END IF;
  IF NEW."source" = 'STAFF' AND actor."role" NOT IN ('STAFF', 'ADMIN') THEN RAISE EXCEPTION 'invalid staff confirmation actor'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransferConfirmation_history_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "TransferConfirmation"
FOR EACH ROW EXECUTE FUNCTION protect_confirmation_history();

CREATE OR REPLACE FUNCTION protect_dispute_resolution()
RETURNS trigger AS $$
BEGIN
  IF OLD."transferRequestId" IS DISTINCT FROM NEW."transferRequestId"
    OR OLD."openedByUserId" IS DISTINCT FROM NEW."openedByUserId"
    OR OLD."category" IS DISTINCT FROM NEW."category"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."previousTransferStatus" IS DISTINCT FROM NEW."previousTransferStatus"
    OR OLD."previousTransferStatusVerified" IS DISTINCT FROM NEW."previousTransferStatusVerified"
    OR OLD."openedAt" IS DISTINCT FROM NEW."openedAt" THEN
    RAISE EXCEPTION 'dispute opening snapshot is immutable';
  END IF;
  IF OLD."status" IN ('RESOLVED', 'REJECTED') THEN RAISE EXCEPTION 'resolved dispute is immutable'; END IF;
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'OPEN' AND NEW."status" IN ('IN_REVIEW', 'RESOLVED', 'REJECTED'))
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('RESOLVED', 'REJECTED'))
  ) THEN RAISE EXCEPTION 'invalid dispute transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Dispute_resolution_guard"
BEFORE UPDATE ON "Dispute"
FOR EACH ROW EXECUTE FUNCTION protect_dispute_resolution();

CREATE OR REPLACE FUNCTION protect_dispute_history()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'dispute history cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Dispute_history_guard" BEFORE DELETE ON "Dispute" FOR EACH ROW EXECUTE FUNCTION protect_dispute_history();

CREATE OR REPLACE FUNCTION protect_refund_integrity()
RETURNS trigger AS $$
BEGIN
  IF OLD."transferRequestId" IS DISTINCT FROM NEW."transferRequestId"
    OR OLD."amountMinor" IS DISTINCT FROM NEW."amountMinor"
    OR OLD."currency" IS DISTINCT FROM NEW."currency"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."senderFacingReason" IS DISTINCT FROM NEW."senderFacingReason"
    OR OLD."initiatedByStaffId" IS DISTINCT FROM NEW."initiatedByStaffId"
    OR OLD."initiatedAt" IS DISTINCT FROM NEW."initiatedAt" THEN
    RAISE EXCEPTION 'refund snapshot is immutable';
  END IF;
  IF OLD."status" <> 'PENDING' OR NEW."status" NOT IN ('REFUNDED', 'FAILED') THEN RAISE EXCEPTION 'invalid refund transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RefundCase_integrity_guard"
BEFORE UPDATE ON "RefundCase"
FOR EACH ROW EXECUTE FUNCTION protect_refund_integrity();

CREATE OR REPLACE FUNCTION protect_refund_history()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'refund history cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "RefundCase_history_guard" BEFORE DELETE ON "RefundCase" FOR EACH ROW EXECUTE FUNCTION protect_refund_history();

-- A reported payout can subsequently fail operationally through an explicit
-- dispute/refund decision. The evidence snapshot remains immutable, while the
-- case status must agree with the terminal transfer outcome.
CREATE OR REPLACE FUNCTION protect_payout_case_integrity()
RETURNS trigger AS $$
BEGIN
  IF OLD."transferRequestId" IS DISTINCT FROM NEW."transferRequestId"
    OR OLD."amountMinor" IS DISTINCT FROM NEW."amountMinor"
    OR OLD."currency" IS DISTINCT FROM NEW."currency"
    OR OLD."payoutMethod" IS DISTINCT FROM NEW."payoutMethod"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'payout case financial snapshot is immutable';
  END IF;

  IF OLD."completedAt" IS NOT NULL AND (
    OLD."completedAmountMinor" IS DISTINCT FROM NEW."completedAmountMinor"
    OR OLD."completedCurrency" IS DISTINCT FROM NEW."completedCurrency"
    OR OLD."completedAt" IS DISTINCT FROM NEW."completedAt"
  ) THEN
    RAISE EXCEPTION 'payout completion snapshot is immutable';
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('IN_PROGRESS', 'ON_HOLD', 'FAILED'))
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('REPORTED', 'ON_HOLD', 'FAILED'))
    OR (OLD."status" = 'ON_HOLD' AND NEW."status" IN ('IN_PROGRESS', 'FAILED'))
    OR (OLD."status" = 'REPORTED' AND NEW."status" IN ('COMPLETED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'invalid payout case status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
