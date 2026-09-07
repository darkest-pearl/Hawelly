CREATE TABLE "TransferCreationIdempotency" (
    "senderId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "transferRequestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferCreationIdempotency_pkey" PRIMARY KEY ("senderId", "idempotencyKey")
);

CREATE UNIQUE INDEX "TransferCreationIdempotency_transferRequestId_key"
    ON "TransferCreationIdempotency"("transferRequestId");

CREATE UNIQUE INDEX "TransferCreationIdempotency_transferRequestId_senderId_key"
    ON "TransferCreationIdempotency"("transferRequestId", "senderId");

CREATE INDEX "TransferCreationIdempotency_createdAt_idx"
    ON "TransferCreationIdempotency"("createdAt");

ALTER TABLE "TransferCreationIdempotency"
    ADD CONSTRAINT "TransferCreationIdempotency_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransferCreationIdempotency"
    ADD CONSTRAINT "TransferCreationIdempotency_transferRequestId_fkey"
    FOREIGN KEY ("transferRequestId", "senderId") REFERENCES "TransferRequest"("id", "senderId") ON DELETE RESTRICT ON UPDATE CASCADE;
