ALTER TABLE "AdminConfiguration"
  ADD COLUMN "sendCurrenciesByOrigin" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "receiveCurrenciesByDestination" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "AdminConfiguration"
  ALTER COLUMN "sendCurrenciesByOrigin" DROP DEFAULT,
  ALTER COLUMN "receiveCurrenciesByDestination" DROP DEFAULT;

CREATE OR REPLACE FUNCTION protect_admin_configuration_snapshot()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'admin configuration snapshots cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."quoteSlaMinutes" IS DISTINCT FROM OLD."quoteSlaMinutes"
    OR NEW."quoteDefaultExpiryMinutes" IS DISTINCT FROM OLD."quoteDefaultExpiryMinutes"
    OR NEW."supportedOriginCountries" IS DISTINCT FROM OLD."supportedOriginCountries"
    OR NEW."supportedDestinationCountries" IS DISTINCT FROM OLD."supportedDestinationCountries"
    OR NEW."supportedCurrencies" IS DISTINCT FROM OLD."supportedCurrencies"
    OR NEW."sendCurrenciesByOrigin" IS DISTINCT FROM OLD."sendCurrenciesByOrigin"
    OR NEW."receiveCurrenciesByDestination" IS DISTINCT FROM OLD."receiveCurrenciesByDestination"
    OR NEW."payoutMethodsByDestination" IS DISTINCT FROM OLD."payoutMethodsByDestination"
    OR NEW."evidenceMaxSizeBytes" IS DISTINCT FROM OLD."evidenceMaxSizeBytes"
    OR NEW."evidenceAllowedContentTypes" IS DISTINCT FROM OLD."evidenceAllowedContentTypes"
    OR NEW."transferLimitsByCurrency" IS DISTINCT FROM OLD."transferLimitsByCurrency"
    OR NEW."broadcastMessage" IS DISTINCT FROM OLD."broadcastMessage"
    OR NEW."maintenanceMessage" IS DISTINCT FROM OLD."maintenanceMessage"
    OR NEW."createdByAdminId" IS DISTINCT FROM OLD."createdByAdminId"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'admin configuration snapshots are immutable';
  END IF;

  IF OLD."active" = false AND NEW."active" = true THEN
    RAISE EXCEPTION 'inactive admin configuration snapshots cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
