-- Once a lifecycle timestamp has been recorded it is part of the immutable
-- quote history. Transitions may populate a previously-null timestamp, but no
-- subsequent update may rewrite or clear it.
CREATE OR REPLACE FUNCTION hawelly_validate_quote_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF OLD."sentAt" IS NOT NULL AND NEW."sentAt" IS DISTINCT FROM OLD."sentAt" THEN
    RAISE EXCEPTION 'quote lifecycle timestamps are immutable';
  END IF;
  IF OLD."acceptedAt" IS NOT NULL AND NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" THEN
    RAISE EXCEPTION 'quote lifecycle timestamps are immutable';
  END IF;
  IF OLD."rejectedAt" IS NOT NULL AND NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt" THEN
    RAISE EXCEPTION 'quote lifecycle timestamps are immutable';
  END IF;

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
