-- Quote versions are historical snapshots. Only lifecycle fields may change
-- after creation; economics, timing, and notes require a new version.
DROP TRIGGER IF EXISTS "Quote_accepted_financial_immutability" ON "Quote";

CREATE OR REPLACE FUNCTION hawelly_protect_quote_snapshot()
RETURNS trigger AS $$
BEGIN
  IF (
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
    NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR
    NEW."createdByStaffId" IS DISTINCT FROM OLD."createdByStaffId" OR
    NEW."senderFacingNote" IS DISTINCT FROM OLD."senderFacingNote" OR
    NEW."internalNote" IS DISTINCT FROM OLD."internalNote" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'quote snapshot fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Quote_snapshot_immutable"
BEFORE UPDATE ON "Quote"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_quote_snapshot();

CREATE OR REPLACE FUNCTION hawelly_validate_quote_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'invalid quote lifecycle transition';
  ELSIF OLD."status" = 'SENT' AND NEW."status" NOT IN
    ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'invalid quote lifecycle transition';
  ELSIF OLD."status" IN ('ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')
    AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'terminal quote status is immutable';
  END IF;

  IF NEW."status" IN ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')
    AND NEW."sentAt" IS NULL THEN
    RAISE EXCEPTION 'sent quote lifecycle requires sentAt';
  END IF;
  IF NEW."status" = 'ACCEPTED' AND NEW."acceptedAt" IS NULL THEN
    RAISE EXCEPTION 'accepted quote requires acceptedAt';
  END IF;
  IF NEW."status" = 'REJECTED' AND NEW."rejectedAt" IS NULL THEN
    RAISE EXCEPTION 'rejected quote requires rejectedAt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Quote_lifecycle_valid"
BEFORE UPDATE ON "Quote"
FOR EACH ROW EXECUTE FUNCTION hawelly_validate_quote_lifecycle();

CREATE UNIQUE INDEX "Quote_one_draft_per_transfer"
  ON "Quote"("transferRequestId")
  WHERE "status" = 'DRAFT';
