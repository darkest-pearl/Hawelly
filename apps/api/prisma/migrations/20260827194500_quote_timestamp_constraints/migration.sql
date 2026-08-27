ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_lifecycle_timestamps_check"
  CHECK (
    ("status" = 'DRAFT' AND "sentAt" IS NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL) OR
    ("status" = 'SENT' AND "sentAt" IS NOT NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL) OR
    ("status" = 'ACCEPTED' AND "sentAt" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "rejectedAt" IS NULL) OR
    ("status" = 'REJECTED' AND "sentAt" IS NOT NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NOT NULL) OR
    ("status" IN ('EXPIRED', 'SUPERSEDED') AND "sentAt" IS NOT NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
  );
