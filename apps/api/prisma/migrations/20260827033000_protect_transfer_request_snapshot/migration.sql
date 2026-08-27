-- A submitted request is an operational record. Recipient and request inputs
-- are immutable; lifecycle services may update status and later workflow links.
CREATE OR REPLACE FUNCTION hawelly_protect_transfer_request_snapshot()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW."reference" IS DISTINCT FROM OLD."reference" OR
    NEW."senderId" IS DISTINCT FROM OLD."senderId" OR
    NEW."recipientId" IS DISTINCT FROM OLD."recipientId" OR
    NEW."originCountry" IS DISTINCT FROM OLD."originCountry" OR
    NEW."destinationCountry" IS DISTINCT FROM OLD."destinationCountry" OR
    NEW."sendAmountMinor" IS DISTINCT FROM OLD."sendAmountMinor" OR
    NEW."sendCurrency" IS DISTINCT FROM OLD."sendCurrency" OR
    NEW."requestedPayoutMethod" IS DISTINCT FROM OLD."requestedPayoutMethod" OR
    NEW."recipientSnapshot" IS DISTINCT FROM OLD."recipientSnapshot" OR
    NEW."quoteDueAt" IS DISTINCT FROM OLD."quoteDueAt" OR
    NEW."senderNote" IS DISTINCT FROM OLD."senderNote" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'submitted transfer request inputs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransferRequest_submitted_inputs_immutable"
BEFORE UPDATE ON "TransferRequest"
FOR EACH ROW EXECUTE FUNCTION hawelly_protect_transfer_request_snapshot();

