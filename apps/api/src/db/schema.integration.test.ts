import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import {
  ActivityOutcome,
  FundingMethod,
  PayoutMethod,
  QuoteStatus,
  Role,
  UserStatus
} from "../generated/prisma/client.js";
import { createPrismaClient } from "./prisma.js";
import { resolveTestDatabaseUrl } from "../testSupport/database.js";

const databaseUrl = resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("database integrity controls", () => {
  const database = createPrismaClient(databaseUrl || "postgresql://invalid");

  beforeAll(async () => {
    await database.$connect();
  });

  beforeEach(async () => {
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE
        "ActivityEvent",
        "Quote",
        "TransferRequest",
        "Recipient",
        "StaffProfile",
        "User"
      CASCADE
    `);
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it("keeps activity events append-only", async () => {
    const event = await database.activityEvent.create({
      data: {
        requestId: "schema-test",
        actionType: "SCHEMA_TEST",
        outcome: ActivityOutcome.SUCCESS,
        metadata: {}
      }
    });

    await expect(
      database.activityEvent.update({
        where: { id: event.id },
        data: { reason: "tampered" }
      })
    ).rejects.toThrow(/immutable/i);
    await expect(
      database.activityEvent.delete({ where: { id: event.id } })
    ).rejects.toThrow(/immutable/i);
  });

  it("prevents financial edits after a quote is accepted", async () => {
    const passwordHash = await hashPassword("SchemaTestPassword123");
    const sender = await database.user.create({
      data: {
        fullName: "Schema Sender",
        email: "schema-sender@example.com",
        passwordHash,
        role: Role.SENDER,
        status: UserStatus.ACTIVE,
        passwordChangedAt: new Date()
      }
    });
    const staff = await database.user.create({
      data: {
        fullName: "Schema Staff",
        email: "schema-staff@example.com",
        passwordHash,
        role: Role.STAFF,
        status: UserStatus.ACTIVE,
        passwordChangedAt: new Date(),
        staffProfile: { create: { displayName: "Schema Staff" } }
      }
    });
    const recipient = await database.recipient.create({
      data: {
        ownerSenderId: sender.id,
        fullName: "Schema Recipient",
        country: "PH",
        payoutMethod: PayoutMethod.BANK_TRANSFER,
        payoutDetails: { bank: "Test Bank" }
      }
    });
    const transfer = await database.transferRequest.create({
      data: {
        reference: "HW-SCHEMA-001",
        senderId: sender.id,
        recipientId: recipient.id,
        originCountry: "AE",
        destinationCountry: "PH",
        sendAmountMinor: 100_000,
        sendCurrency: "AED",
        requestedPayoutMethod: PayoutMethod.BANK_TRANSFER,
        recipientSnapshot: {
          id: recipient.id,
          fullName: recipient.fullName,
          country: recipient.country,
          payoutMethod: recipient.payoutMethod,
          payoutDetails: recipient.payoutDetails
        },
        quoteDueAt: new Date(Date.now() + 3_600_000)
      }
    });
    await expect(
      database.transferRequest.update({
        where: { id: transfer.id },
        data: {
          recipientSnapshot: {
            id: recipient.id,
            fullName: "Mutated recipient",
            country: recipient.country,
            payoutMethod: recipient.payoutMethod,
            payoutDetails: recipient.payoutDetails
          }
        }
      })
    ).rejects.toThrow();
    expect(
      (await database.transferRequest.findUniqueOrThrow({ where: { id: transfer.id } }))
        .recipientSnapshot
    ).toMatchObject({ fullName: recipient.fullName });
    const quote = await database.quote.create({
      data: {
        transferRequestId: transfer.id,
        version: 1,
        sendAmountMinor: 100_000,
        sendCurrency: "AED",
        feeAmountMinor: 2_000,
        effectiveRate: "15.25",
        receiveAmountMinor: 1_494_500,
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(Date.now() + 86_400_000),
        expiresAt: new Date(Date.now() + 3_600_000),
        status: QuoteStatus.ACCEPTED,
        createdByStaffId: staff.id,
        acceptedAt: new Date()
      }
    });
    await database.transferRequest.update({
      where: { id: transfer.id },
      data: { acceptedQuoteId: quote.id }
    });

    await expect(
      database.quote.update({
        where: { id: quote.id },
        data: { feeAmountMinor: 2_001 }
      })
    ).rejects.toThrow(/financial fields are immutable/i);

    await expect(
      database.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.REJECTED }
      })
    ).rejects.toThrow(/status is immutable/i);

    const secondQuote = await database.quote.create({
      data: {
        transferRequestId: transfer.id,
        version: 2,
        sendAmountMinor: 100_000,
        sendCurrency: "AED",
        feeAmountMinor: 2_100,
        effectiveRate: "15.20",
        receiveAmountMinor: 1_487_920,
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(Date.now() + 86_400_000),
        expiresAt: new Date(Date.now() + 3_600_000),
        createdByStaffId: staff.id
      }
    });

    await expect(
      database.quote.update({
        where: { id: secondQuote.id },
        data: { status: QuoteStatus.ACCEPTED, acceptedAt: new Date() }
      })
    ).rejects.toThrow();

    await expect(
      database.fundingInstruction.create({
        data: {
          transferRequestId: transfer.id,
          acceptedQuoteId: secondQuote.id,
          method: FundingMethod.BANK_TRANSFER,
          amountMinor: 102_000,
          currency: "AED",
          payeeName: "Hawelly Test",
          senderReference: "HW-SCHEMA-001",
          instructions: "Test-only funding instructions",
          publishedByStaffId: staff.id
        }
      })
    ).rejects.toThrow();

    const otherTransfer = await database.transferRequest.create({
      data: {
        reference: "HW-SCHEMA-002",
        senderId: sender.id,
        recipientId: recipient.id,
        originCountry: "AE",
        destinationCountry: "PH",
        sendAmountMinor: 50_000,
        sendCurrency: "AED",
        requestedPayoutMethod: PayoutMethod.BANK_TRANSFER,
        recipientSnapshot: {
          id: recipient.id,
          fullName: recipient.fullName,
          country: recipient.country,
          payoutMethod: recipient.payoutMethod,
          payoutDetails: recipient.payoutDetails
        },
        quoteDueAt: new Date(Date.now() + 3_600_000)
      }
    });
    const otherTransferQuote = await database.quote.create({
      data: {
        transferRequestId: otherTransfer.id,
        version: 1,
        sendAmountMinor: 50_000,
        sendCurrency: "AED",
        feeAmountMinor: 1_000,
        effectiveRate: "15.25",
        receiveAmountMinor: 747_250,
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(Date.now() + 86_400_000),
        expiresAt: new Date(Date.now() + 3_600_000),
        status: QuoteStatus.ACCEPTED,
        createdByStaffId: staff.id,
        acceptedAt: new Date()
      }
    });
    await expect(
      database.transferRequest.update({
        where: { id: transfer.id },
        data: { acceptedQuoteId: otherTransferQuote.id }
      })
    ).rejects.toThrow(/belong to the transfer/i);

    const otherSender = await database.user.create({
      data: {
        fullName: "Other Schema Sender",
        email: "other-schema-sender@example.com",
        passwordHash,
        role: Role.SENDER,
        status: UserStatus.ACTIVE,
        passwordChangedAt: new Date()
      }
    });
    await expect(
      database.fundingProof.create({
        data: {
          transferRequestId: transfer.id,
          submittedBySenderId: otherSender.id,
          reference: "wrong-owner"
        }
      })
    ).rejects.toThrow();
  });
});
