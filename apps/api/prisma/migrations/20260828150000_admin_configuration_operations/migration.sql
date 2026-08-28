ALTER TABLE "AdminConfiguration"
  ADD COLUMN "transferLimitsByCurrency" JSONB,
  ADD COLUMN "broadcastMessage" VARCHAR(1000),
  ADD COLUMN "maintenanceMessage" VARCHAR(1000);

ALTER TABLE "AdminConfiguration"
  ADD CONSTRAINT "AdminConfiguration_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AdminConfiguration_one_active_idx"
  ON "AdminConfiguration" ((true)) WHERE "active" = true;

CREATE UNIQUE INDEX "StaffCapabilityGrant_one_active_idx"
  ON "StaffCapabilityGrant" ("staffUserId", "capability")
  WHERE "revokedAt" IS NULL;

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

CREATE TRIGGER "AdminConfiguration_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "AdminConfiguration"
FOR EACH ROW EXECUTE FUNCTION protect_admin_configuration_snapshot();
