-- Preserve the recipient identity and payout instructions used for each
-- transfer request. Existing rows are backfilled from their owned recipient
-- before the column becomes mandatory.
ALTER TABLE "TransferRequest"
  ADD COLUMN "recipientSnapshot" JSONB;

UPDATE "TransferRequest" AS transfer
SET "recipientSnapshot" = jsonb_build_object(
  'id', recipient."id",
  'fullName', recipient."fullName",
  'country', recipient."country",
  'phone', recipient."phone",
  'payoutMethod', recipient."payoutMethod",
  'payoutDetails', recipient."payoutDetails",
  'address', recipient."address"
)
FROM "Recipient" AS recipient
WHERE recipient."id" = transfer."recipientId"
  AND recipient."ownerSenderId" = transfer."senderId";

ALTER TABLE "TransferRequest"
  ALTER COLUMN "recipientSnapshot" SET NOT NULL;

ALTER TABLE "TransferRequest"
  ADD CONSTRAINT "TransferRequest_recipient_snapshot_object_check"
  CHECK (jsonb_typeof("recipientSnapshot") = 'object'),
  ADD CONSTRAINT "TransferRequest_codes_and_sla_check"
  CHECK (
    "originCountry" ~ '^[A-Z]{2}$' AND
    "destinationCountry" ~ '^[A-Z]{2}$' AND
    "sendCurrency" ~ '^[A-Z]{3}$' AND
    "quoteDueAt" > "createdAt"
  );

ALTER TABLE "Recipient"
  ADD CONSTRAINT "Recipient_country_and_payout_details_check"
  CHECK (
    "country" ~ '^[A-Z]{2}$' AND
    jsonb_typeof("payoutDetails") = 'object'
  );
