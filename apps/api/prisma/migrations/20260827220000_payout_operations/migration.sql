ALTER TABLE "PayoutCase"
  ADD COLUMN "completedAmountMinor" BIGINT,
  ADD COLUMN "completedCurrency" CHAR(3);

ALTER TABLE "PayoutEvidence"
  ADD COLUMN "uploadExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "uploadedAt" TIMESTAMPTZ(3);

ALTER TABLE "PayoutCase"
  ADD CONSTRAINT "PayoutCase_amount_positive_check"
  CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "PayoutCase_completion_pair_check"
  CHECK (
    ("completedAmountMinor" IS NULL AND "completedCurrency" IS NULL AND "completedAt" IS NULL)
    OR
    ("completedAmountMinor" > 0 AND "completedCurrency" IS NOT NULL AND "completedAt" IS NOT NULL)
  );

ALTER TABLE "PayoutEvidence"
  ADD CONSTRAINT "PayoutEvidence_reference_or_file_check"
  CHECK ("externalReference" IS NOT NULL OR "storageObjectKey" IS NOT NULL),
  ADD CONSTRAINT "PayoutEvidence_file_metadata_check"
  CHECK (
    ("storageObjectKey" IS NULL AND "originalFilename" IS NULL AND "contentType" IS NULL AND "sizeBytes" IS NULL AND "uploadExpiresAt" IS NULL AND "uploadedAt" IS NULL)
    OR
    ("storageObjectKey" IS NOT NULL AND "originalFilename" IS NOT NULL AND "contentType" IS NOT NULL AND "sizeBytes" > 0 AND "uploadExpiresAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PayoutEvidence_upload_time_check"
  CHECK ("uploadedAt" IS NULL OR "uploadedAt" <= "uploadExpiresAt");

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
    OLD."completedAt" IS DISTINCT FROM NEW."completedAt"
    OR OLD."completedAmountMinor" IS DISTINCT FROM NEW."completedAmountMinor"
    OR OLD."completedCurrency" IS DISTINCT FROM NEW."completedCurrency"
  ) THEN
    RAISE EXCEPTION 'payout completion snapshot is immutable';
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('IN_PROGRESS', 'ON_HOLD', 'FAILED'))
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('REPORTED', 'ON_HOLD', 'FAILED'))
    OR (OLD."status" = 'ON_HOLD' AND NEW."status" IN ('IN_PROGRESS', 'FAILED'))
    OR (OLD."status" = 'REPORTED' AND NEW."status" = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'invalid payout case status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutCase_integrity_guard"
BEFORE UPDATE ON "PayoutCase"
FOR EACH ROW EXECUTE FUNCTION protect_payout_case_integrity();

CREATE OR REPLACE FUNCTION protect_payout_evidence_integrity()
RETURNS trigger AS $$
BEGIN
  IF OLD."payoutCaseId" IS DISTINCT FROM NEW."payoutCaseId"
    OR OLD."storageObjectKey" IS DISTINCT FROM NEW."storageObjectKey"
    OR OLD."externalReference" IS DISTINCT FROM NEW."externalReference"
    OR OLD."originalFilename" IS DISTINCT FROM NEW."originalFilename"
    OR OLD."contentType" IS DISTINCT FROM NEW."contentType"
    OR OLD."sizeBytes" IS DISTINCT FROM NEW."sizeBytes"
    OR OLD."uploadExpiresAt" IS DISTINCT FROM NEW."uploadExpiresAt"
    OR OLD."createdByStaffId" IS DISTINCT FROM NEW."createdByStaffId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."uploadedAt" IS NOT NULL
    OR (NEW."uploadedAt" IS NOT NULL AND NEW."uploadedAt" > OLD."uploadExpiresAt") THEN
    RAISE EXCEPTION 'payout evidence snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutEvidence_integrity_guard"
BEFORE UPDATE ON "PayoutEvidence"
FOR EACH ROW EXECUTE FUNCTION protect_payout_evidence_integrity();

CREATE OR REPLACE FUNCTION protect_payout_evidence_history()
RETURNS trigger AS $$
BEGIN
  IF OLD."externalReference" IS NOT NULL OR OLD."uploadedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'payout evidence history cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutEvidence_history_guard"
BEFORE DELETE ON "PayoutEvidence"
FOR EACH ROW EXECUTE FUNCTION protect_payout_evidence_history();
