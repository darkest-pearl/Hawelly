CREATE TABLE "FundingInstructionTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "method" "FundingMethod" NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "payeeName" VARCHAR(160) NOT NULL,
  "provider" VARCHAR(160),
  "accountReference" VARCHAR(500),
  "instructions" VARCHAR(2000) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByStaffId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FundingInstructionTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FundingInstructionTemplate_createdByStaffId_fkey"
    FOREIGN KEY ("createdByStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FundingInstructionTemplate_active_currency_method_idx"
  ON "FundingInstructionTemplate"("active", "currency", "method");

ALTER TABLE "FundingInstruction" ADD COLUMN "templateId" UUID;
ALTER TABLE "FundingInstruction"
  ADD CONSTRAINT "FundingInstruction_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "FundingInstructionTemplate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FundingInstruction_templateId_idx" ON "FundingInstruction"("templateId");

ALTER TABLE "FundingProof"
  ADD COLUMN "uploadExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "uploadedAt" TIMESTAMPTZ(3);
ALTER TABLE "FundingProof" ALTER COLUMN "status" SET DEFAULT 'PENDING_UPLOAD';

ALTER TABLE "FundingProof"
  ADD CONSTRAINT "FundingProof_amount_currency_pair_check"
  CHECK (("amountMinor" IS NULL) = ("currency" IS NULL)),
  ADD CONSTRAINT "FundingProof_reference_or_file_check"
  CHECK ("reference" IS NOT NULL OR "storageObjectKey" IS NOT NULL),
  ADD CONSTRAINT "FundingProof_file_metadata_check"
  CHECK (
    ("storageObjectKey" IS NULL AND "originalFilename" IS NULL AND "contentType" IS NULL
      AND "sizeBytes" IS NULL AND "uploadExpiresAt" IS NULL AND "uploadedAt" IS NULL) OR
    ("storageObjectKey" IS NOT NULL AND "originalFilename" IS NOT NULL AND "contentType" IS NOT NULL
      AND "sizeBytes" IS NOT NULL AND "uploadExpiresAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "FundingProof_review_lifecycle_check"
  CHECK (
    ("status" = 'PENDING_UPLOAD' AND "storageObjectKey" IS NOT NULL AND "uploadedAt" IS NULL
      AND "reviewedByStaffId" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL) OR
    ("status" = 'SUBMITTED' AND "reviewedByStaffId" IS NULL AND "reviewedAt" IS NULL
      AND "reviewReason" IS NULL AND ("storageObjectKey" IS NULL OR "uploadedAt" IS NOT NULL)) OR
    ("status" IN ('NEEDS_RESUBMISSION', 'VERIFIED', 'REJECTED')
      AND "reviewedByStaffId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL)
  );

CREATE UNIQUE INDEX "FundingProof_one_active_submission_per_transfer"
  ON "FundingProof"("transferRequestId")
  WHERE "status" IN ('PENDING_UPLOAD', 'SUBMITTED');

CREATE OR REPLACE FUNCTION hawelly_protect_funding_instruction_snapshot()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'funding instruction snapshot is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FundingInstruction_snapshot_immutable"
BEFORE UPDATE ON "FundingInstruction"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_funding_instruction_snapshot();

CREATE OR REPLACE FUNCTION hawelly_protect_funding_proof_snapshot()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW."transferRequestId" IS DISTINCT FROM OLD."transferRequestId" OR
    NEW."submittedBySenderId" IS DISTINCT FROM OLD."submittedBySenderId" OR
    NEW."reference" IS DISTINCT FROM OLD."reference" OR
    NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."transferredAt" IS DISTINCT FROM OLD."transferredAt" OR
    NEW."storageObjectKey" IS DISTINCT FROM OLD."storageObjectKey" OR
    NEW."originalFilename" IS DISTINCT FROM OLD."originalFilename" OR
    NEW."contentType" IS DISTINCT FROM OLD."contentType" OR
    NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes" OR
    NEW."uploadExpiresAt" IS DISTINCT FROM OLD."uploadExpiresAt" OR
    NEW."senderNote" IS DISTINCT FROM OLD."senderNote" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'funding proof snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FundingProof_snapshot_immutable"
BEFORE UPDATE ON "FundingProof"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_funding_proof_snapshot();

CREATE OR REPLACE FUNCTION hawelly_validate_funding_proof_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PENDING_UPLOAD' AND NEW."status" NOT IN ('PENDING_UPLOAD', 'SUBMITTED') THEN
    RAISE EXCEPTION 'invalid funding proof lifecycle transition';
  ELSIF OLD."status" = 'SUBMITTED' AND NEW."status" NOT IN
    ('SUBMITTED', 'NEEDS_RESUBMISSION', 'VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'invalid funding proof lifecycle transition';
  ELSIF OLD."status" IN ('NEEDS_RESUBMISSION', 'VERIFIED', 'REJECTED')
    AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'terminal funding proof status is immutable';
  END IF;
  IF OLD."uploadedAt" IS NOT NULL AND NEW."uploadedAt" IS DISTINCT FROM OLD."uploadedAt" THEN
    RAISE EXCEPTION 'funding proof lifecycle timestamps are immutable';
  END IF;
  IF OLD."reviewedAt" IS NOT NULL AND NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt" THEN
    RAISE EXCEPTION 'funding proof lifecycle timestamps are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FundingProof_lifecycle_valid"
BEFORE UPDATE ON "FundingProof"
FOR EACH ROW EXECUTE FUNCTION hawelly_validate_funding_proof_lifecycle();

CREATE OR REPLACE FUNCTION hawelly_protect_funding_proof_history()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'PENDING_UPLOAD' OR OLD."uploadedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'submitted funding proof history cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FundingProof_history_delete_guard"
BEFORE DELETE ON "FundingProof"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_funding_proof_history();
