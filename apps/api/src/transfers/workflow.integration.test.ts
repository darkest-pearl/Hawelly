import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AuthConfig } from "../auth/config.js";
import { hashPassword } from "../auth/password.js";
import { AuthService } from "../auth/service.js";
import { createPrismaClient } from "../db/prisma.js";
import {
  Capability,
  PayoutMethod,
  Role,
  StaffOperationalStatus,
  TransferStatus,
  UserStatus
} from "../generated/prisma/client.js";
import { resolveTestDatabaseUrl } from "../testSupport/database.js";
import { TransferWorkflowService } from "./service.js";

const databaseUrl = resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const integrationDescribe = databaseUrl ? describe : describe.skip;

const runtimeConfig = {
  host: "127.0.0.1",
  port: 4000,
  environment: "test",
  corsOrigins: ["http://localhost:3000"],
  trustedBffAddresses: ["127.0.0.1", "::1", "::ffff:127.0.0.1"]
} as const;

const authConfig: AuthConfig = {
  accessSecret: new TextEncoder().encode(
    "workflow-test-access-secret-is-distinct-and-at-least-32-bytes"
  ),
  rateLimitPepper: "workflow-test-rate-pepper-is-distinct-and-at-least-32-bytes",
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604_800,
  sessionAbsoluteTtlSeconds: 2_592_000,
  registrationWindowSeconds: 3_600,
  registrationIpMaxAttempts: 100,
  loginWindowSeconds: 900,
  loginIpMaxFailures: 100,
  loginIdentifierMaxFailures: 100,
  loginAccountMaxFailures: 100,
  issuer: "hawelly-api",
  audience: "hawelly-clients"
};

const recipientInput = {
  fullName: "Maria Santos",
  country: "ph",
  phone: "+639171234567",
  payoutMethod: PayoutMethod.BANK_TRANSFER,
  payoutDetails: {
    accountName: "Maria Santos",
    bankName: "Example Bank",
    accountNumber: "1234567890"
  },
  address: "Quezon City"
};

integrationDescribe("recipient and transfer workflow", () => {
  const database = createPrismaClient(databaseUrl || "postgresql://invalid");
  let now = new Date();
  let referenceSequence = 0;
  const authService = new AuthService(database, authConfig, () => new Date(now));
  const workflow = new TransferWorkflowService(
    database,
    {
      quoteSlaMinutes: 45,
      corridors: [
        {
          originCountry: "AE",
          destinationCountry: "PH",
          sendCurrencies: ["AED"],
          payoutMethods: [
            PayoutMethod.BANK_TRANSFER,
            PayoutMethod.CASH_PICKUP,
            PayoutMethod.MOBILE_MONEY
          ]
        }
      ]
    },
    () => new Date(now),
    () => `HW-20260827-${String(++referenceSequence).padStart(12, "0")}`
  );
  const app = createApp(runtimeConfig, {
    authService,
    transferWorkflowService: workflow
  });

  async function createUser(
    email: string,
    role: Role,
    options: {
      operationalStatus?: StaffOperationalStatus;
      withStaffProfile?: boolean;
    } = {}
  ) {
    return database.user.create({
      data: {
        fullName: `${role} Test User`,
        email,
        passwordHash: await hashPassword("CorrectHorse123"),
        role,
        status: UserStatus.ACTIVE,
        passwordChangedAt: now,
        staffProfile:
          role !== Role.SENDER && options.withStaffProfile !== false
            ? {
                create: {
                  displayName: `${role} Test User`,
                  operationalStatus:
                    options.operationalStatus ?? StaffOperationalStatus.ACTIVE
                }
              }
            : undefined
      }
    });
  }

  async function accessToken(email: string) {
    const response = await request(app).post("/auth/login").send({
      email,
      password: "CorrectHorse123"
    });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function authenticated(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createRecipient(token: string, overrides: Record<string, unknown> = {}) {
    return request(app)
      .post("/recipients")
      .set(authenticated(token))
      .send({ ...recipientInput, ...overrides });
  }

  async function createTransfer(
    token: string,
    recipientId: string,
    overrides: Record<string, unknown> = {}
  ) {
    return request(app)
      .post("/transfers")
      .set(authenticated(token))
      .send({
        recipientId,
        originCountry: "ae",
        destinationCountry: "ph",
        sendAmountMinor: "125000",
        sendCurrency: "aed",
        requestedPayoutMethod: PayoutMethod.BANK_TRANSFER,
        senderNote: "Family support",
        ...overrides
      });
  }

  beforeAll(async () => {
    await database.$connect();
  });

  beforeEach(async () => {
    now = new Date();
    referenceSequence = 0;
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE
        "ActivityEvent",
        "AuthRateLimit",
        "AuthSession",
        "StaffCapabilityGrant",
        "StaffProfile",
        "TransferRequest",
        "Recipient",
        "User"
      CASCADE
    `);
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it("scopes recipient CRUD to the authenticated sender and rejects mass assignment", async () => {
    await createUser("owner@example.com", Role.SENDER);
    await createUser("other@example.com", Role.SENDER);
    const ownerToken = await accessToken("owner@example.com");
    const otherToken = await accessToken("other@example.com");

    const injected = await createRecipient(ownerToken, { ownerSenderId: "attacker" });
    expect(injected.status).toBe(400);

    const created = await createRecipient(ownerToken);
    expect(created.status).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(created.body.recipient.country).toBe("PH");
    const recipientId = created.body.recipient.id as string;

    const ownerList = await request(app)
      .get("/recipients")
      .set(authenticated(ownerToken));
    const otherList = await request(app)
      .get("/recipients")
      .set(authenticated(otherToken));
    expect(ownerList.body.recipients).toHaveLength(1);
    expect(otherList.body.recipients).toEqual([]);

    const nonexistentId = "00000000-0000-4000-8000-000000000000";
    const crossRead = await request(app)
      .get(`/recipients/${recipientId}`)
      .set(authenticated(otherToken));
    const missingRead = await request(app)
      .get(`/recipients/${nonexistentId}`)
      .set(authenticated(otherToken));
    expect(crossRead.status).toBe(404);
    expect(crossRead.body).toEqual(missingRead.body);

    const crossPatch = await request(app)
      .patch(`/recipients/${recipientId}`)
      .set(authenticated(otherToken))
      .send({ fullName: "Hijacked" });
    const crossDelete = await request(app)
      .delete(`/recipients/${recipientId}`)
      .set(authenticated(otherToken));
    expect(crossPatch.status).toBe(404);
    expect(crossDelete.status).toBe(404);

    const updated = await request(app)
      .patch(`/recipients/${recipientId}`)
      .set(authenticated(ownerToken))
      .send({ fullName: "Maria Updated", phone: null });
    expect(updated.status).toBe(200);
    expect(updated.body.recipient).toMatchObject({
      fullName: "Maria Updated",
      phone: null
    });
  });

  it("serializes concurrent recipient patches without splitting payout method and details", async () => {
    await createUser("recipient-race@example.com", Role.SENDER);
    const token = await accessToken("recipient-race@example.com");
    const created = await createRecipient(token);
    const recipientId = created.body.recipient.id as string;

    const [payoutUpdate, profileUpdate] = await Promise.all([
      request(app)
        .patch(`/recipients/${recipientId}`)
        .set(authenticated(token))
        .send({
          payoutMethod: PayoutMethod.MOBILE_MONEY,
          payoutDetails: {
            provider: "Example Mobile",
            accountNumber: "639171234567"
          }
        }),
      request(app)
        .patch(`/recipients/${recipientId}`)
        .set(authenticated(token))
        .send({ fullName: "Maria Concurrent" })
    ]);

    expect(payoutUpdate.status).toBe(200);
    expect(profileUpdate.status).toBe(200);
    const finalRecipient = await request(app)
      .get(`/recipients/${recipientId}`)
      .set(authenticated(token));
    expect(finalRecipient.body.recipient).toMatchObject({
      fullName: "Maria Concurrent",
      payoutMethod: PayoutMethod.MOBILE_MONEY,
      payoutDetails: {
        provider: "Example Mobile",
        accountNumber: "639171234567"
      }
    });
  });

  it("creates a deterministic request snapshot and exposes a redacted staff queue", async () => {
    const sender = await createUser("sender@example.com", Role.SENDER);
    const admin = await createUser("admin@example.com", Role.ADMIN);
    const staff = await createUser("staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.create({
      data: {
        staffUserId: staff.id,
        capability: Capability.TRANSFER_REVIEW,
        grantedByUserId: admin.id,
        reason: "Workflow test"
      }
    });
    const senderToken = await accessToken("sender@example.com");
    const staffToken = await accessToken("staff@example.com");
    const recipient = await createRecipient(senderToken);

    const expectedQuoteDueAt = new Date(now.getTime() + 45 * 60_000).toISOString();
    const created = await createTransfer(senderToken, recipient.body.recipient.id);
    expect(created.status).toBe(201);
    expect(created.body.transfer).toMatchObject({
      sendAmountMinor: "125000",
      sendCurrency: "AED",
      status: TransferStatus.REQUESTED,
      quoteDueAt: expectedQuoteDueAt,
      recipient: { fullName: "Maria Santos", phone: "+639171234567" }
    });
    expect(created.body.transfer.senderId).toBeUndefined();

    await request(app)
      .patch(`/recipients/${recipient.body.recipient.id}`)
      .set(authenticated(senderToken))
      .send({ fullName: "Changed Future Recipient" });
    const detail = await request(app)
      .get(`/transfers/${created.body.transfer.id}`)
      .set(authenticated(senderToken));
    expect(detail.body.transfer.recipient.fullName).toBe("Maria Santos");
    expect(detail.body.transfer.timeline).toEqual([
      expect.objectContaining({
        type: "TRANSFER_REQUEST_CREATED",
        status: TransferStatus.REQUESTED
      })
    ]);
    expect(JSON.stringify(detail.body)).not.toContain("requestId");
    expect(JSON.stringify(detail.body)).not.toContain("actorRole");

    const queue = await request(app)
      .get("/operations/transfers")
      .set(authenticated(staffToken));
    expect(queue.status).toBe(200);
    expect(queue.body.transfers).toHaveLength(1);
    expect(queue.body.transfers[0]).toMatchObject({
      reference: created.body.transfer.reference,
      recipientName: "Maria Santos",
      sender: { id: sender.id, fullName: sender.fullName }
    });
    const serializedQueue = JSON.stringify(queue.body);
    for (const forbidden of [
      "sender@example.com",
      "+639171234567",
      "1234567890",
      "Quezon City",
      "Family support",
      "payoutDetails"
    ]) {
      expect(serializedQueue).not.toContain(forbidden);
    }

    const event = await database.activityEvent.findFirstOrThrow({
      where: {
        actionType: "TRANSFER_REQUEST_CREATED",
        entityId: created.body.transfer.id
      }
    });
    expect(event.nextState).toEqual({ status: TransferStatus.REQUESTED });
    const serializedEvent = JSON.stringify(event);
    expect(serializedEvent).not.toContain("1234567890");
    expect(serializedEvent).not.toContain("Family support");
  });

  it("rejects invalid amounts, corridors, recipient mismatches, and server-owned fields", async () => {
    await createUser("validation@example.com", Role.SENDER);
    await createUser("other-validation@example.com", Role.SENDER);
    const token = await accessToken("validation@example.com");
    const otherToken = await accessToken("other-validation@example.com");
    const recipient = await createRecipient(token);
    const otherRecipient = await createRecipient(otherToken);

    for (const amount of ["0", "-1", "1.5", "1e3", "9223372036854775808"]) {
      const response = await createTransfer(token, recipient.body.recipient.id, {
        sendAmountMinor: amount
      });
      expect(response.status).toBe(400);
    }
    for (const override of [
      { originCountry: "US" },
      { destinationCountry: "IN" },
      { sendCurrency: "USD" },
      { requestedPayoutMethod: PayoutMethod.CASH_PICKUP }
    ]) {
      const response = await createTransfer(token, recipient.body.recipient.id, override);
      expect(response.status).toBe(400);
    }
    const crossOwner = await createTransfer(token, otherRecipient.body.recipient.id);
    expect(crossOwner.status).toBe(404);

    const injected = await createTransfer(token, recipient.body.recipient.id, {
      status: TransferStatus.COMPLETED
    });
    expect(injected.status).toBe(400);
    expect(await database.transferRequest.count()).toBe(0);
  });

  it("protects referenced recipients and sender transfer ownership", async () => {
    await createUser("history@example.com", Role.SENDER);
    await createUser("history-other@example.com", Role.SENDER);
    const token = await accessToken("history@example.com");
    const otherToken = await accessToken("history-other@example.com");
    const recipient = await createRecipient(token);
    const transfer = await createTransfer(token, recipient.body.recipient.id);

    const deletion = await request(app)
      .delete(`/recipients/${recipient.body.recipient.id}`)
      .set(authenticated(token));
    expect(deletion.status).toBe(409);
    expect(deletion.body.error.code).toBe("RECIPIENT_IN_USE");

    const crossDetail = await request(app)
      .get(`/transfers/${transfer.body.transfer.id}`)
      .set(authenticated(otherToken));
    const crossCancel = await request(app)
      .post(`/transfers/${transfer.body.transfer.id}/cancel`)
      .set(authenticated(otherToken))
      .send({});
    expect(crossDetail.status).toBe(404);
    expect(crossCancel.status).toBe(404);
    expect(
      (await database.transferRequest.findUniqueOrThrow({
        where: { id: transfer.body.transfer.id }
      })).status
    ).toBe(TransferStatus.REQUESTED);
  });

  it("enforces active staff profiles and the TRANSFER_REVIEW capability", async () => {
    const admin = await createUser("ops-admin@example.com", Role.ADMIN);
    const staff = await createUser("ops-staff@example.com", Role.STAFF);
    await createUser("inactive-staff@example.com", Role.STAFF, {
      operationalStatus: StaffOperationalStatus.INACTIVE
    });
    await createUser("missing-profile@example.com", Role.STAFF, {
      withStaffProfile: false
    });
    await createUser("ops-sender@example.com", Role.SENDER);

    for (const email of ["inactive-staff@example.com", "missing-profile@example.com"]) {
      const deniedLogin = await request(app).post("/auth/login").send({
        email,
        password: "CorrectHorse123"
      });
      expect(deniedLogin.status).toBe(401);
      expect(deniedLogin.body.error.code).toBe("INVALID_CREDENTIALS");
    }

    const staffToken = await accessToken("ops-staff@example.com");
    const senderToken = await accessToken("ops-sender@example.com");
    expect(
      (
        await request(app)
          .get("/operations/transfers")
          .set(authenticated(staffToken))
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/operations/transfers")
          .set(authenticated(senderToken))
      ).status
    ).toBe(403);
    expect(
      await database.activityEvent.count({
        where: {
          actionType: "AUTHORIZATION_DENIED",
          entityId: Capability.TRANSFER_REVIEW
        }
      })
    ).toBe(2);

    await database.staffCapabilityGrant.create({
      data: {
        staffUserId: staff.id,
        capability: Capability.TRANSFER_REVIEW,
        grantedByUserId: admin.id,
        reason: "Workflow test"
      }
    });
    const refreshedStaffToken = await accessToken("ops-staff@example.com");
    expect(
      (
        await request(app)
          .get("/operations/transfers")
          .set(authenticated(refreshedStaffToken))
      ).status
    ).toBe(200);
  });

  it("applies review and cancellation transitions centrally with safe timeline reasons", async () => {
    const admin = await createUser("transition-admin@example.com", Role.ADMIN);
    const staff = await createUser("transition-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.create({
      data: {
        staffUserId: staff.id,
        capability: Capability.TRANSFER_REVIEW,
        grantedByUserId: admin.id,
        reason: "Workflow test"
      }
    });
    await createUser("transition-sender@example.com", Role.SENDER);
    const senderToken = await accessToken("transition-sender@example.com");
    const staffToken = await accessToken("transition-staff@example.com");
    const recipient = await createRecipient(senderToken);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);

    const missingReason = await request(app)
      .post(`/operations/transfers/${transfer.body.transfer.id}/review`)
      .set(authenticated(staffToken))
      .send({ action: "REQUEST_INFO" });
    expect(missingReason.status).toBe(400);

    const needsInfo = await request(app)
      .post(`/operations/transfers/${transfer.body.transfer.id}/review`)
      .set(authenticated(staffToken))
      .send({ action: "REQUEST_INFO", reason: "Please confirm the account number" });
    expect(needsInfo.status).toBe(200);
    expect(needsInfo.body.transfer.status).toBe(TransferStatus.NEEDS_INFO);

    const quoting = await request(app)
      .post(`/operations/transfers/${transfer.body.transfer.id}/review`)
      .set(authenticated(staffToken))
      .send({ action: "START_QUOTING" });
    expect(quoting.status).toBe(200);
    expect(quoting.body.transfer.status).toBe(TransferStatus.QUOTING);

    const cancelled = await request(app)
      .post(`/transfers/${transfer.body.transfer.id}/cancel`)
      .set(authenticated(senderToken))
      .send({ reason: "Plans changed" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.transfer.status).toBe(TransferStatus.CANCELLED);

    const invalidRepeat = await request(app)
      .post(`/transfers/${transfer.body.transfer.id}/cancel`)
      .set(authenticated(senderToken))
      .send({});
    expect(invalidRepeat.status).toBe(409);
    expect(invalidRepeat.body.error.code).toBe("INVALID_TRANSFER_TRANSITION");

    const detail = await request(app)
      .get(`/transfers/${transfer.body.transfer.id}`)
      .set(authenticated(senderToken));
    expect(detail.body.transfer.timeline).toEqual([
      expect.objectContaining({ status: TransferStatus.REQUESTED, reason: null }),
      expect.objectContaining({
        status: TransferStatus.NEEDS_INFO,
        reason: "Please confirm the account number"
      }),
      expect.objectContaining({ status: TransferStatus.QUOTING, reason: null }),
      expect.objectContaining({
        status: TransferStatus.CANCELLED,
        reason: "Plans changed"
      })
    ]);
    const cancellationEvent = await database.activityEvent.findFirstOrThrow({
      where: {
        entityId: transfer.body.transfer.id,
        actionType: "TRANSFER_REQUEST_CANCELLED",
        outcome: "SUCCESS"
      }
    });
    expect(cancellationEvent).toMatchObject({
      previousState: { status: TransferStatus.QUOTING },
      nextState: { status: TransferStatus.CANCELLED }
    });
  });

  it("allows only one competing transition to commit", async () => {
    const admin = await createUser("race-admin@example.com", Role.ADMIN);
    const staff = await createUser("race-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.create({
      data: {
        staffUserId: staff.id,
        capability: Capability.TRANSFER_REVIEW,
        grantedByUserId: admin.id,
        reason: "Workflow test"
      }
    });
    await createUser("race-sender@example.com", Role.SENDER);
    const senderToken = await accessToken("race-sender@example.com");
    const staffToken = await accessToken("race-staff@example.com");
    const recipient = await createRecipient(senderToken);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);

    const [cancel, decline] = await Promise.all([
      request(app)
        .post(`/transfers/${transfer.body.transfer.id}/cancel`)
        .set(authenticated(senderToken))
        .send({}),
      request(app)
        .post(`/operations/transfers/${transfer.body.transfer.id}/review`)
        .set(authenticated(staffToken))
        .send({ action: "DECLINE", reason: "Unsupported request" })
    ]);
    expect([cancel.status, decline.status].sort()).toEqual([200, 409]);
    const successEvents = await database.activityEvent.count({
      where: {
        entityId: transfer.body.transfer.id,
        actionType: {
          in: ["TRANSFER_REQUEST_CANCELLED", "TRANSFER_REQUEST_DECLINED"]
        },
        outcome: "SUCCESS"
      }
    });
    expect(successEvents).toBe(1);
  });
});
