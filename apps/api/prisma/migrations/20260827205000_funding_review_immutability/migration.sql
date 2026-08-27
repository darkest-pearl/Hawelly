CREATE OR REPLACE FUNCTION hawelly_protect_funding_review_history()
RETURNS trigger AS $$
BEGIN
  IF OLD."reviewedByStaffId" IS NOT NULL
    AND NEW."reviewedByStaffId" IS DISTINCT FROM OLD."reviewedByStaffId" THEN
    RAISE EXCEPTION 'funding proof review history is immutable';
  END IF;
  IF OLD."reviewReason" IS NOT NULL
    AND NEW."reviewReason" IS DISTINCT FROM OLD."reviewReason" THEN
    RAISE EXCEPTION 'funding proof review history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FundingProof_review_history_immutable"
BEFORE UPDATE ON "FundingProof"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_funding_review_history();
