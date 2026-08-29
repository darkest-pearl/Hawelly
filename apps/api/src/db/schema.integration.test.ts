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

  it("does not grant private schema objects to public or Supabase client roles", async () => {
    const objectGrants = await database.$queryRaw<
      Array<{ objectName: string; grantee: string; privilegeType: string }>
    >`
      SELECT
        namespace.nspname || '.' || object.relname AS "objectName",
        COALESCE(role.rolname, 'PUBLIC') AS grantee,
        privilege.privilege_type AS "privilegeType"
      FROM pg_class AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(
          object.relacl,
          acldefault(
            CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
            object.relowner
          )
        )
      ) AS privilege
      LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND object.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND (privilege.grantee = 0 OR role.rolname IN ('anon', 'authenticated'))
    `;
    const schemaGrants = await database.$queryRaw<
      Array<{ grantee: string; privilegeType: string }>
    >`
      SELECT
        COALESCE(role.rolname, 'PUBLIC') AS grantee,
        privilege.privilege_type AS "privilegeType"
      FROM pg_namespace AS namespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) AS privilege
      LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND (privilege.grantee = 0 OR role.rolname IN ('anon', 'authenticated'))
    `;

    expect(objectGrants).toEqual([]);
    expect(schemaGrants).toEqual([]);
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
        sentAt: new Date(),
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
    ).rejects.toThrow(/quote snapshot fields are immutable/i);

    await expect(
      database.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.REJECTED }
      })
    ).rejects.toThrow(/terminal quote status is immutable/i);

    await expect(
      database.quote.update({
        where: { id: quote.id },
        data: { acceptedAt: new Date(quote.acceptedAt!.getTime() + 1_000) }
      })
    ).rejects.toThrow(/quote lifecycle timestamps are immutable/i);

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
        sentAt: new Date(),
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
