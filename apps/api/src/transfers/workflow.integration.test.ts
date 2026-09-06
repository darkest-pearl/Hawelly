import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import type { AuthConfig } from "../auth/config.js";
import { hashPassword } from "../auth/password.js";
import { AuthService } from "../auth/service.js";
import { createPrismaClient } from "../db/prisma.js";
import {
  Capability,
  FundingMethod,
  PayoutMethod,
  Role,
  StaffOperationalStatus,
  TransferStatus,
  UserStatus
} from "../generated/prisma/client.js";
import { resolveTestDatabaseUrl } from "../testSupport/database.js";
import { TransferWorkflowService } from "./service.js";
import { QuoteWorkflowService } from "../quotes/service.js";
import type { FundingWorkflowConfig } from "../funding/config.js";
import { FundingWorkflowService } from "../funding/service.js";
import { LocalEvidenceStorage } from "../funding/storage.js";
import { PayoutWorkflowService } from "../payout/service.js";
import { ResolutionWorkflowService } from "../resolution/service.js";
import { AdminWorkflowService } from "../admin/service.js";

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
      maximumRecipientsPerSender: 100,
      recipientCreateWindowSeconds: 3_600,
      recipientCreateMaximum: 100,
      maximumActiveTransfersPerSender: 100,
      transferCreateWindowSeconds: 3_600,
      transferCreateMaximum: 100,
      corridors: [
        {
          originCountry: "AE",
          destinationCountry: "PH",
          sendCurrencies: ["AED"],
          receiveCurrencies: ["PHP"],
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
  const quoteWorkflow = new QuoteWorkflowService(
    database,
    { defaultExpiryMinutes: 30 },
    () => new Date(now)
  );
  const evidenceRoot = join(tmpdir(), `hawelly-funding-workflow-${process.pid}`);
  const fundingConfig: FundingWorkflowConfig = {
    storageRoot: evidenceRoot,
    publicBaseUrl: "http://127.0.0.1:4000",
    signingSecret: "workflow-evidence-signing-secret-is-at-least-32-bytes",
    signedUrlTtlSeconds: 300,
    maximumProofBytes: 8 * 1024 * 1024,
    allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"]
  };
  const evidenceStorage = new LocalEvidenceStorage(evidenceRoot, fundingConfig.maximumProofBytes);
  const fundingWorkflow = new FundingWorkflowService(
    database,
    evidenceStorage,
    fundingConfig,
    () => new Date(now)
  );
  const payoutWorkflow = new PayoutWorkflowService(
    database,
    evidenceStorage,
    fundingConfig,
    () => new Date(now)
  );
  const resolutionWorkflow = new ResolutionWorkflowService(database, () => new Date(now));
  const adminWorkflow = new AdminWorkflowService(database, fundingConfig, () => new Date(now));
  const app = createApp(runtimeConfig, {
    authService,
    transferWorkflowService: workflow,
    quoteWorkflowService: quoteWorkflow,
    fundingWorkflowService: fundingWorkflow,
    payoutWorkflowService: payoutWorkflow,
    resolutionWorkflowService: resolutionWorkflow,
    adminWorkflowService: adminWorkflow
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

  async function createAcceptedTransfer(senderToken: string, staffToken: string) {
    const recipient = await createRecipient(senderToken);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);
    const transferId = transfer.body.transfer.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/review`).set(authenticated(staffToken)).send({ action: "START_QUOTING" })).status).toBe(200);
    const draft = await request(app)
      .post(`/operations/transfers/${transferId}/quotes`)
      .set(authenticated(staffToken))
      .send({
        sendAmountMinor: "125000",
        sendCurrency: "AED",
        feeAmountMinor: "2500",
        effectiveRate: "15.125",
        receiveAmountMinor: "1852813",
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(now.getTime() + 86_400_000).toISOString(),
        validForMinutes: 30
      });
    expect(draft.status).toBe(201);
    expect((await request(app).post(`/operations/transfers/${transferId}/quotes/${draft.body.quote.id}/send`).set(authenticated(staffToken)).send({})).status).toBe(200);
    expect((await request(app).post(`/transfers/${transferId}/quotes/${draft.body.quote.id}/decision`).set(authenticated(senderToken)).send({ decision: "ACCEPT" })).status).toBe(200);
    return transferId;
  }

  async function createReportedPayout(senderToken: string, staffToken: string, staffId: string) {
    const transferId = await createAcceptedTransfer(senderToken, staffToken);
    await database.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.FUNDS_CONFIRMED } });
    const associate = await database.associateContact.create({ data: {
      businessName: "Resolution Test Associate", countries: ["PH"], cities: ["Manila"], payoutMethods: [PayoutMethod.BANK_TRANSFER], currencies: ["PHP"], contactChannels: { email: "resolution@example.test" }, createdByStaffId: staffId
    } });
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-case`).set(authenticated(staffToken)).send({ associateContactId: associate.id, expectedBy: new Date(now.getTime() + 86_400_000).toISOString() })).status).toBe(201);
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-evidence`).set(authenticated(staffToken)).send({ externalReference: "RESOLUTION-PAYOUT-REF" })).status).toBe(201);
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({ completedAmountMinor: "1852813", currency: "PHP", completedAt: now.toISOString(), senderFacingNote: "Payout sent." })).status).toBe(200);
    return transferId;
  }

  beforeAll(async () => {
    await database.$connect();
    await fundingWorkflow.initializeStorage();
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
    await rm(evidenceRoot, { recursive: true, force: true });
  });

  it("completes the full beta workflow from sender registration through recipient confirmation", async () => {
    const admin = await createUser("beta-admin@example.com", Role.ADMIN);
    const adminToken = await accessToken(admin.email);
    const capabilities = [
      Capability.TRANSFER_REVIEW,
      Capability.QUOTE_MANAGE,
      Capability.FUNDING_REVIEW,
      Capability.PAYOUT_MANAGE,
      Capability.TRANSFER_HOLD,
      Capability.ASSOCIATE_VIEW,
      Capability.ASSOCIATE_MANAGE
    ];
    const staffResponse = await request(app)
      .post("/admin/staff")
      .set(authenticated(adminToken))
      .send({
        fullName: "Beta Operations",
        email: "beta-operations@example.com",
        temporaryPassword: "CorrectHorse123",
        capabilities,
        reason: "Provision full workflow beta operator",
        confirmed: true
      });
    expect(staffResponse.status, JSON.stringify(staffResponse.body)).toBe(201);
    const staffToken = await accessToken("beta-operations@example.com");

    const registration = await request(app).post("/auth/register").send({
      fullName: "Beta Sender",
      email: "beta-sender@example.com",
      password: "BetaSenderPassword123"
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(201);
    const senderToken = registration.body.accessToken as string;
    const otherRegistration = await request(app).post("/auth/register").send({
      fullName: "Other Beta Sender",
      email: "beta-other@example.com",
      password: "OtherBetaPassword123"
    });
    expect(otherRegistration.status).toBe(201);
    const otherToken = otherRegistration.body.accessToken as string;

    expect((await request(app).get("/admin/staff").set(authenticated(senderToken))).status).toBe(403);
    const recipient = await createRecipient(senderToken);
    expect(recipient.status).toBe(201);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);
    expect(transfer.status).toBe(201);
    const transferId = transfer.body.transfer.id as string;
    expect((await request(app).get(`/transfers/${transferId}`).set(authenticated(otherToken))).status).toBe(404);

    const queue = await request(app).get("/operations/transfers").set(authenticated(staffToken));
    expect(queue.status).toBe(200);
    expect(queue.body.transfers.some((item: { id: string }) => item.id === transferId)).toBe(true);
    expect((await request(app).post(`/operations/transfers/${transferId}/review`).set(authenticated(staffToken)).send({ action: "START_QUOTING" })).status).toBe(200);
    const quote = await request(app)
      .post(`/operations/transfers/${transferId}/quotes`)
      .set(authenticated(staffToken))
      .send({
        sendAmountMinor: "125000",
        sendCurrency: "AED",
        feeAmountMinor: "2500",
        effectiveRate: "15.125",
        receiveAmountMinor: "1852813",
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(now.getTime() + 86_400_000).toISOString(),
        validForMinutes: 30
      });
    expect(quote.status).toBe(201);
    const quoteId = quote.body.quote.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/quotes/${quoteId}/send`).set(authenticated(staffToken)).send({})).status).toBe(200);
    expect((await request(app).post(`/transfers/${transferId}/quotes/${quoteId}/decision`).set(authenticated(senderToken)).send({ decision: "ACCEPT" })).body.transferStatus).toBe("QUOTE_ACCEPTED");

    const template = await request(app)
      .post("/admin/funding-templates")
      .set(authenticated(adminToken))
      .send({
        name: "Beta AED account",
        method: FundingMethod.BANK_TRANSFER,
        currency: "AED",
        payeeName: "Hawelly Operations",
        provider: "Beta Bank",
        accountReference: "AE00 BETA 0000 0000",
        instructions: "Use the exact transfer reference.",
        reason: "Publish approved beta funding destination",
        confirmed: true
      });
    expect(template.status).toBe(201);
    const instruction = await request(app)
      .post(`/operations/transfers/${transferId}/funding-instruction`)
      .set(authenticated(staffToken))
      .send({ templateId: template.body.template.id, senderReference: "HW-BETA-FUND-001" });
    expect(instruction.status).toBe(201);
    expect((await request(app).get(`/transfers/${transferId}/funding`).set(authenticated(senderToken))).body.instruction.senderReference).toBe("HW-BETA-FUND-001");

    const fundingReceipt = Buffer.from("%PDF-1.4\nbeta funding receipt\n%%EOF", "utf8");
    const proof = await request(app)
      .post(`/transfers/${transferId}/funding-proofs`)
      .set(authenticated(senderToken))
      .send({
        reference: "BETA-BANK-REF-001",
        amountMinor: "125000",
        currency: "AED",
        transferredAt: now.toISOString(),
        attachment: { filename: "funding.pdf", contentType: "application/pdf", sizeBytes: fundingReceipt.byteLength }
      });
    expect(proof.status).toBe(201);
    const proofUpload = new URL(proof.body.upload.url);
    expect((await request(app).put(`${proofUpload.pathname}${proofUpload.search}`).set("Content-Type", "application/pdf").send(fundingReceipt)).status).toBe(200);
    const proofId = proof.body.proof.id as string;
    expect((await request(app).post(`/transfers/${transferId}/funding-proofs/${proofId}/read-url`).set(authenticated(otherToken)).send({})).status).toBe(404);
    expect((await request(app).post(`/operations/transfers/${transferId}/funding-proofs/${proofId}/review`).set(authenticated(staffToken)).send({ decision: "VERIFY", reason: "Beta receipt matched" })).body.proof.status).toBe("VERIFIED");
    expect((await request(app).post(`/operations/transfers/${transferId}/funds-confirmation`).set(authenticated(staffToken)).send({ proofId, reason: "Beta funds visible" })).body.transferStatus).toBe("FUNDS_CONFIRMED");

    const associate = await request(app)
      .post("/operations/associates")
      .set(authenticated(staffToken))
      .send({
        businessName: "Beta Manila Desk",
        countries: ["PH"],
        cities: ["Manila"],
        payoutMethods: ["BANK_TRANSFER"],
        currencies: ["PHP"],
        contactChannels: { operationsEmail: "beta-associate@example.test" },
        trustNotes: "Approved only for the isolated beta smoke"
      });
    expect(associate.status).toBe(201);
    const payout = await request(app)
      .post(`/operations/transfers/${transferId}/payout-case`)
      .set(authenticated(staffToken))
      .send({ associateContactId: associate.body.associate.id, expectedBy: new Date(now.getTime() + 86_400_000).toISOString() });
    expect(payout.status).toBe(201);

    const payoutReceipt = Buffer.from("%PDF-1.4\nbeta payout receipt\n%%EOF", "utf8");
    const payoutEvidence = await request(app)
      .post(`/operations/transfers/${transferId}/payout-evidence`)
      .set(authenticated(staffToken))
      .send({ externalReference: "BETA-PAYOUT-001", attachment: { filename: "payout.pdf", contentType: "application/pdf", sizeBytes: payoutReceipt.byteLength } });
    expect(payoutEvidence.status).toBe(201);
    const payoutUpload = new URL(payoutEvidence.body.upload.url);
    expect((await request(app).put(`${payoutUpload.pathname}${payoutUpload.search}`).set("Content-Type", "application/pdf").send(payoutReceipt)).status).toBe(200);
    const held = await request(app).post(`/operations/transfers/${transferId}/payout-hold`).set(authenticated(staffToken)).send({ reason: "Beta callback check", senderFacingNote: "We are completing an operational check." });
    expect(held.body.transferStatus).toBe("ON_HOLD");
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-release`).set(authenticated(staffToken)).send({ reason: "Beta callback cleared", senderFacingNote: "The payout is moving again." })).body.transferStatus).toBe("PAYOUT_IN_PROGRESS");
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({ completedAmountMinor: "1852813", currency: "PHP", completedAt: now.toISOString(), senderFacingNote: "The payout was sent." })).body.transferStatus).toBe("PAYOUT_REPORTED");
    expect((await request(app).post(`/operations/transfers/${transferId}/confirmation-request`).set(authenticated(staffToken)).send({ note: "Please confirm recipient receipt." })).body.transferStatus).toBe("CONFIRMATION_PENDING");
    const completed = await request(app).post(`/transfers/${transferId}/recipient-confirmation`).set(authenticated(senderToken)).send({ note: "Recipient confirmed receipt." });
    expect(completed.body.transferStatus).toBe("COMPLETED");

    const senderDetail = await request(app).get(`/transfers/${transferId}`).set(authenticated(senderToken));
    expect(senderDetail.body.transfer.status).toBe("COMPLETED");
    expect(JSON.stringify(senderDetail.body)).not.toMatch(/BETA-PAYOUT-001|beta-associate@example|accountReference|internalNote/i);
    const activity = await request(app).get("/admin/activity?limit=100").set(authenticated(adminToken));
    const actions = activity.body.events.map((event: { actionType: string }) => event.actionType);
    expect(actions).toEqual(expect.arrayContaining([
      "TRANSFER_REQUEST_CREATED",
      "QUOTE_ACCEPTED",
      "FUNDING_INSTRUCTIONS_PUBLISHED",
      "FUNDS_RECEIVED_CONFIRMED",
      "PAYOUT_REPORTED",
      "RECIPIENT_RECEIPT_CONFIRMED"
    ]));
    expect((await request(app).get("/health/storage")).status).toBe(200);
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

  it("exposes only the effective sender corridor options to authenticated senders", async () => {
    await createUser("options-sender@example.com", Role.SENDER);
    await createUser("options-staff@example.com", Role.STAFF);
    const senderToken = await accessToken("options-sender@example.com");
    const staffToken = await accessToken("options-staff@example.com");

    expect((await request(app).get("/transfers/options")).status).toBe(401);
    expect(
      (await request(app).get("/transfers/options").set(authenticated(staffToken))).status
    ).toBe(403);

    const response = await request(app)
      .get("/transfers/options")
      .set(authenticated(senderToken));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      options: {
        configurationVersion: null,
        quoteSlaMinutes: 45,
        corridors: [
          {
            originCountry: "AE",
            destinationCountry: "PH",
            sendCurrencies: ["AED"],
            receiveCurrencies: ["PHP"],
            payoutMethods: ["BANK_TRANSFER", "CASH_PICKUP", "MOBILE_MONEY"]
          }
        ]
      }
    });
    expect(JSON.stringify(response.body)).not.toMatch(/limit|evidence|maintenance|broadcast/i);
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

  it("serializes and enforces sender write velocity and active-work quotas", async () => {
    await createUser("quota-sender@example.com", Role.SENDER);
    const token = await accessToken("quota-sender@example.com");
    const limitedWorkflow = new TransferWorkflowService(database, {
      quoteSlaMinutes: 45,
      maximumRecipientsPerSender: 10,
      recipientCreateWindowSeconds: 3_600,
      recipientCreateMaximum: 1,
      maximumActiveTransfersPerSender: 1,
      transferCreateWindowSeconds: 3_600,
      transferCreateMaximum: 10,
      corridors: [{
        originCountry: "AE",
        destinationCountry: "PH",
        sendCurrencies: ["AED"],
        receiveCurrencies: ["PHP"],
        payoutMethods: [PayoutMethod.BANK_TRANSFER]
      }]
    });
    const limitedApp = createApp(runtimeConfig, {
      authService,
      transferWorkflowService: limitedWorkflow
    });
    const recipientResponses = await Promise.all([
      request(limitedApp).post("/recipients").set(authenticated(token)).send(recipientInput),
      request(limitedApp).post("/recipients").set(authenticated(token)).send(recipientInput)
    ]);
    expect(recipientResponses.map(({ status }) => status).sort()).toEqual([201, 429]);
    const limited = recipientResponses.find(({ status }) => status === 429);
    expect(limited?.headers["retry-after"]).toBe("3600");
    const recipientId = recipientResponses.find(({ status }) => status === 201)?.body.recipient.id as string;
    const transferInput = {
      recipientId,
      originCountry: "AE",
      destinationCountry: "PH",
      sendAmountMinor: "125000",
      sendCurrency: "AED",
      requestedPayoutMethod: PayoutMethod.BANK_TRANSFER
    };
    const transferResponses = await Promise.all([
      request(limitedApp).post("/transfers").set(authenticated(token)).send(transferInput),
      request(limitedApp).post("/transfers").set(authenticated(token)).send(transferInput)
    ]);
    expect(transferResponses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(transferResponses.find(({ status }) => status === 409)?.body.error.code).toBe(
      "ACTIVE_TRANSFER_LIMIT_REACHED"
    );
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

  it("issues a sender-safe quote and accepts it exactly once with immutable economics", async () => {
    const sender = await createUser("quote-sender@example.com", Role.SENDER);
    const other = await createUser("quote-other@example.com", Role.SENDER);
    const admin = await createUser("quote-admin@example.com", Role.ADMIN);
    const staff = await createUser("quote-staff@example.com", Role.STAFF);
    const reviewOnlyStaff = await createUser("quote-review-only@example.com", Role.STAFF);
    const noCapabilityStaff = await createUser("quote-no-capability@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE].map((capability) => ({
        staffUserId: staff.id,
        capability,
        grantedByUserId: admin.id,
        reason: "Quote workflow test"
      }))
    });
    await database.staffCapabilityGrant.create({
      data: {
        staffUserId: reviewOnlyStaff.id,
        capability: Capability.TRANSFER_REVIEW,
        grantedByUserId: admin.id,
        reason: "Must not authorize quote creation"
      }
    });
    const senderToken = await accessToken(sender.email);
    const otherToken = await accessToken(other.email);
    const staffToken = await accessToken(staff.email);
    const reviewOnlyToken = await accessToken(reviewOnlyStaff.email);
    const noCapabilityToken = await accessToken(noCapabilityStaff.email);
    const recipient = await createRecipient(senderToken);
    const createdTransfer = await createTransfer(senderToken, recipient.body.recipient.id);
    const transferId = createdTransfer.body.transfer.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/review`).set(authenticated(staffToken)).send({ action: "START_QUOTING" })).status).toBe(200);

    expect((await request(app).post(`/operations/transfers/${transferId}/quotes`).set(authenticated(reviewOnlyToken)).send({})).status).toBe(403);
    expect((await request(app).post(`/operations/transfers/${transferId}/quotes`).set(authenticated(noCapabilityToken)).send({})).status).toBe(403);
    const denialEvents = await database.activityEvent.findMany({
      where: {
        actionType: "AUTHORIZATION_DENIED",
        actorUserId: { in: [reviewOnlyStaff.id, noCapabilityStaff.id] }
      },
      select: { actorUserId: true, entityId: true }
    });
    expect(denialEvents).toEqual(expect.arrayContaining([
      { actorUserId: reviewOnlyStaff.id, entityId: Capability.QUOTE_MANAGE },
      { actorUserId: noCapabilityStaff.id, entityId: Capability.TRANSFER_REVIEW }
    ]));

    const draft = await request(app)
      .post(`/operations/transfers/${transferId}/quotes`)
      .set(authenticated(staffToken))
      .send({
        sendAmountMinor: "125000",
        sendCurrency: "AED",
        feeAmountMinor: "2500",
        feeBreakdown: { service: "2500" },
        effectiveRate: "15.125",
        receiveAmountMinor: "1852813",
        receiveCurrency: "PHP",
        expectedDeliveryAt: new Date(now.getTime() + 86_400_000).toISOString(),
        validForMinutes: 30,
        senderFacingNote: "Delivery by tomorrow",
        internalNote: "Internal pricing rationale"
      });
    expect(draft.status).toBe(201);
    const quoteId = draft.body.quote.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/quotes/${quoteId}/send`).set(authenticated(staffToken)).send({})).status).toBe(200);

    const senderQuotes = await request(app)
      .get(`/transfers/${transferId}/quotes`)
      .set(authenticated(senderToken));
    expect(senderQuotes.status).toBe(200);
    expect(senderQuotes.body.quotes[0]).toMatchObject({
      id: quoteId,
      status: "SENT",
      feeAmountMinor: "2500",
      receiveCurrency: "PHP",
      senderFacingNote: "Delivery by tomorrow"
    });
    expect(JSON.stringify(senderQuotes.body)).not.toContain("Internal pricing rationale");
    expect((await request(app).get(`/transfers/${transferId}/quotes`).set(authenticated(otherToken))).status).toBe(404);
    expect((await request(app).post(`/transfers/${transferId}/quotes/${quoteId}/decision`).set(authenticated(otherToken)).send({ decision: "ACCEPT" })).status).toBe(404);

    const decisions = await Promise.all([
      request(app).post(`/transfers/${transferId}/quotes/${quoteId}/decision`).set(authenticated(senderToken)).send({ decision: "ACCEPT" }),
      request(app).post(`/transfers/${transferId}/quotes/${quoteId}/decision`).set(authenticated(senderToken)).send({ decision: "ACCEPT" })
    ]);
    expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
    const storedTransfer = await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } });
    expect(storedTransfer).toMatchObject({ status: TransferStatus.QUOTE_ACCEPTED, acceptedQuoteId: quoteId });
    await expect(database.quote.update({ where: { id: quoteId }, data: { feeAmountMinor: 1n } })).rejects.toThrow();
  });

  it("sends a replacement quote without rewriting the prior version and expires stale quotes", async () => {
    const sender = await createUser("requote-sender@example.com", Role.SENDER);
    const admin = await createUser("requote-admin@example.com", Role.ADMIN);
    const staff = await createUser("requote-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE].map((capability) => ({ staffUserId: staff.id, capability, grantedByUserId: admin.id, reason: "Requote test" }))
    });
    const senderToken = await accessToken(sender.email);
    const staffToken = await accessToken(staff.email);
    const recipient = await createRecipient(senderToken);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);
    const transferId = transfer.body.transfer.id as string;
    await request(app).post(`/operations/transfers/${transferId}/review`).set(authenticated(staffToken)).send({ action: "START_QUOTING" });

    const quoteBody = (receiveAmountMinor: string, validForMinutes = 30) => ({
      sendAmountMinor: "125000",
      sendCurrency: "AED",
      feeAmountMinor: "2500",
      effectiveRate: "15.125",
      receiveAmountMinor,
      receiveCurrency: "PHP",
      expectedDeliveryAt: new Date(now.getTime() + 86_400_000).toISOString(),
      validForMinutes
    });
    const first = await request(app).post(`/operations/transfers/${transferId}/quotes`).set(authenticated(staffToken)).send(quoteBody("1852813"));
    await request(app).post(`/operations/transfers/${transferId}/quotes/${first.body.quote.id}/send`).set(authenticated(staffToken)).send({});
    const rejected = await request(app).post(`/transfers/${transferId}/quotes/${first.body.quote.id}/decision`).set(authenticated(senderToken)).send({ decision: "REJECT", reason: "Please improve the rate" });
    expect(rejected.body.transferStatus).toBe("QUOTING");
    const second = await request(app).post(`/operations/transfers/${transferId}/quotes`).set(authenticated(staffToken)).send(quoteBody("1860000"));
    expect(second.body.quote.version).toBe(2);
    await request(app).post(`/operations/transfers/${transferId}/quotes/${second.body.quote.id}/send`).set(authenticated(staffToken)).send({});
    const third = await request(app).post(`/operations/transfers/${transferId}/quotes`).set(authenticated(staffToken)).send(quoteBody("1865000", 5));
    expect(third.body.quote.version).toBe(3);
    await request(app).post(`/operations/transfers/${transferId}/quotes/${third.body.quote.id}/send`).set(authenticated(staffToken)).send({});
    const versions = await database.quote.findMany({ where: { transferRequestId: transferId }, orderBy: { version: "asc" } });
    expect(versions.map((quote) => quote.status)).toEqual(["REJECTED", "SUPERSEDED", "SENT"]);

    now = new Date(now.getTime() + 6 * 60_000);
    const afterExpiry = await request(app).get(`/transfers/${transferId}/quotes`).set(authenticated(senderToken));
    expect(afterExpiry.body.quotes[0].status).toBe("EXPIRED");
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.QUOTE_EXPIRED);
    expect((await request(app).post(`/transfers/${transferId}/quotes/${third.body.quote.id}/decision`).set(authenticated(senderToken)).send({ decision: "ACCEPT" })).status).toBe(409);
  });

  it("rejects a quote currency that is not enabled for the transfer destination", async () => {
    const sender = await createUser("currency-policy-sender@example.com", Role.SENDER);
    const admin = await createUser("currency-policy-admin@example.com", Role.ADMIN);
    const staff = await createUser("currency-policy-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE].map((capability) => ({
        staffUserId: staff.id,
        capability,
        grantedByUserId: admin.id,
        reason: "Quote currency policy test"
      }))
    });
    const senderToken = await accessToken(sender.email);
    const staffToken = await accessToken(staff.email);
    const recipient = await createRecipient(senderToken);
    const transfer = await createTransfer(senderToken, recipient.body.recipient.id);
    const transferId = transfer.body.transfer.id as string;
    await request(app).post(`/operations/transfers/${transferId}/review`).set(authenticated(staffToken)).send({ action: "START_QUOTING" });

    const restrictedQuoteWorkflow = new QuoteWorkflowService(
      database,
      { defaultExpiryMinutes: 30 },
      () => new Date(now),
      {
        getActive: async () => ({
          version: 1,
          quoteSlaMinutes: 45,
          quoteDefaultExpiryMinutes: 30,
          supportedOriginCountries: ["AE"],
          supportedDestinationCountries: ["PH"],
          supportedCurrencies: ["AED", "PHP"],
          sendCurrenciesByOrigin: { AE: ["AED"] },
          receiveCurrenciesByDestination: { PH: ["PHP"] },
          payoutMethodsByDestination: { PH: [PayoutMethod.BANK_TRANSFER] },
          evidenceMaxSizeBytes: 8 * 1024 * 1024,
          evidenceAllowedContentTypes: ["application/pdf"],
          transferLimitsByCurrency: {}
        })
      }
    );
    const restrictedApp = createApp(runtimeConfig, {
      authService,
      transferWorkflowService: workflow,
      quoteWorkflowService: restrictedQuoteWorkflow
    });
    const response = await request(restrictedApp)
      .post(`/operations/transfers/${transferId}/quotes`)
      .set(authenticated(staffToken))
      .send({
        sendAmountMinor: "125000",
        sendCurrency: "AED",
        feeAmountMinor: "2500",
        effectiveRate: "15.125",
        receiveAmountMinor: "1852813",
        receiveCurrency: "NGN",
        expectedDeliveryAt: new Date(now.getTime() + 86_400_000).toISOString(),
        validForMinutes: 30
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNSUPPORTED_RECEIVE_CURRENCY");
    expect(await database.quote.count({ where: { transferRequestId: transferId } })).toBe(0);
  });

  it("publishes accepted-quote funding instructions and keeps proof submission distinct from funds confirmation", async () => {
    const sender = await createUser("funding-sender@example.com", Role.SENDER);
    const otherSender = await createUser("funding-other@example.com", Role.SENDER);
    const admin = await createUser("funding-admin@example.com", Role.ADMIN);
    const staff = await createUser("funding-staff@example.com", Role.STAFF);
    const unprivilegedStaff = await createUser("funding-unprivileged@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.FUNDING_REVIEW].map((capability) => ({
        staffUserId: staff.id,
        capability,
        grantedByUserId: admin.id,
        reason: "Funding workflow test"
      }))
    });
    const template = await database.fundingInstructionTemplate.create({
      data: {
        name: "AED operations account",
        method: FundingMethod.BANK_TRANSFER,
        currency: "AED",
        payeeName: "Hawelly Operations",
        provider: "Test Bank",
        accountReference: "AE00 TEST 0000 0000",
        instructions: "Use the exact sender reference.",
        createdByStaffId: admin.id
      }
    });
    const senderToken = await accessToken(sender.email);
    const otherToken = await accessToken(otherSender.email);
    const staffToken = await accessToken(staff.email);
    const unprivilegedToken = await accessToken(unprivilegedStaff.email);
    const transferId = await createAcceptedTransfer(senderToken, staffToken);

    expect((await request(app).post(`/operations/transfers/${transferId}/funding-instruction`).set(authenticated(unprivilegedToken)).send({})).status).toBe(403);
    const published = await request(app)
      .post(`/operations/transfers/${transferId}/funding-instruction`)
      .set(authenticated(staffToken))
      .send({ templateId: template.id, senderReference: "HW-FUND-001", validUntil: new Date(now.getTime() + 3_600_000).toISOString() });
    expect(published.status).toBe(201);
    expect(published.body.instruction).toMatchObject({ amountMinor: "125000", currency: "AED", payeeName: "Hawelly Operations" });
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.FUNDING_PENDING);
    await expect(database.fundingInstruction.update({ where: { id: published.body.instruction.id }, data: { amountMinor: 1n } })).rejects.toThrow(/funding instruction snapshot is immutable/i);

    expect((await request(app).get(`/transfers/${transferId}/funding`).set(authenticated(otherToken))).status).toBe(404);
    expect((await request(app).post(`/transfers/${transferId}/funding-proofs`).set(authenticated(otherToken)).send({ reference: "CROSS-SENDER" })).status).toBe(404);
    const senderFunding = await request(app).get(`/transfers/${transferId}/funding`).set(authenticated(senderToken));
    expect(senderFunding.body.instruction.senderReference).toBe("HW-FUND-001");
    expect(JSON.stringify(senderFunding.body)).not.toContain(admin.id);
    expect(JSON.stringify(senderFunding.body)).not.toContain("storageObjectKey");

    const receipt = Buffer.from("%PDF-1.4\nminimal funding receipt\n%%EOF", "utf8");
    const submission = await request(app)
      .post(`/transfers/${transferId}/funding-proofs`)
      .set(authenticated(senderToken))
      .send({
        reference: "BANK-REF-100",
        amountMinor: "125000",
        currency: "AED",
        transferredAt: now.toISOString(),
        attachment: { filename: "receipt.pdf", contentType: "application/pdf", sizeBytes: receipt.byteLength }
      });
    expect(submission.status).toBe(201);
    expect(submission.body.proof.status).toBe("PENDING_UPLOAD");
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.FUNDING_PENDING);
    const uploadUrl = new URL(submission.body.upload.url);
    const invalidUpload = await request(app)
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set("Content-Type", "application/pdf")
      .send(Buffer.alloc(receipt.byteLength, 0x61));
    expect(invalidUpload.status).toBe(400);
    const uploaded = await request(app)
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set("Content-Type", "application/pdf")
      .send(receipt);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.proof.status).toBe("SUBMITTED");
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.FUNDING_SUBMITTED);

    const proofId = submission.body.proof.id as string;
    await expect(database.fundingProof.update({ where: { id: proofId }, data: { reference: "tampered" } })).rejects.toThrow(/funding proof snapshot is immutable/i);
    await expect(database.fundingProof.delete({ where: { id: proofId } })).rejects.toThrow(/history cannot be deleted/i);
    expect((await request(app).post(`/transfers/${transferId}/funding-proofs/${proofId}/read-url`).set(authenticated(otherToken)).send({})).status).toBe(404);
    const readGrant = await request(app).post(`/transfers/${transferId}/funding-proofs/${proofId}/read-url`).set(authenticated(senderToken)).send({});
    expect(readGrant.status).toBe(200);
    const readUrl = new URL(readGrant.body.url);
    const downloaded = await request(app).get(`${readUrl.pathname}${readUrl.search}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["cache-control"]).toContain("no-store");
    expect(downloaded.headers["content-disposition"]).toContain("attachment");
    expect(Buffer.compare(downloaded.body as Buffer, receipt)).toBe(0);
    readUrl.searchParams.set("signature", "A".repeat(43));
    expect((await request(app).get(`${readUrl.pathname}${readUrl.search}`)).status).toBe(403);
    const expiringReadUrl = new URL(readGrant.body.url);
    now = new Date(now.getTime() + 6 * 60_000);
    expect((await request(app).get(`${expiringReadUrl.pathname}${expiringReadUrl.search}`)).status).toBe(410);

    const reviewed = await request(app)
      .post(`/operations/transfers/${transferId}/funding-proofs/${proofId}/review`)
      .set(authenticated(staffToken))
      .send({ decision: "VERIFY", reason: "Matched bank receipt" });
    expect(reviewed.body).toMatchObject({ proof: { status: "VERIFIED" }, transferStatus: "FUNDING_SUBMITTED" });
    await expect(database.fundingProof.update({ where: { id: proofId }, data: { status: "REJECTED" } })).rejects.toThrow(/terminal funding proof status is immutable/i);
    await expect(database.fundingProof.update({ where: { id: proofId }, data: { reviewReason: "rewritten" } })).rejects.toThrow(/funding proof review history is immutable/i);
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.FUNDING_SUBMITTED);
    expect((await request(app).post(`/operations/transfers/${transferId}/funds-confirmation`).set(authenticated(unprivilegedToken)).send({ proofId, reason: "unauthorized" })).status).toBe(403);
    const confirmed = await request(app)
      .post(`/operations/transfers/${transferId}/funds-confirmation`)
      .set(authenticated(staffToken))
      .send({ proofId, reason: "Funds visible in Hawelly account" });
    expect(confirmed.body.transferStatus).toBe("FUNDS_CONFIRMED");

    const actions = await database.activityEvent.findMany({
      where: { entityId: { in: [transferId, proofId, Capability.FUNDING_REVIEW] } },
      select: { actionType: true }
    });
    expect(actions.map((event) => event.actionType)).toEqual(expect.arrayContaining([
      "AUTHORIZATION_DENIED",
      "FUNDING_INSTRUCTIONS_PUBLISHED",
      "FUNDING_PROOF_SUBMITTED",
      "FUNDING_PROOF_VERIFIED",
      "FUNDS_RECEIVED_CONFIRMED"
    ]));
    expect((await request(app).get("/health/storage")).status).toBe(200);
  });

  it("returns a transfer for resubmission or rejection without confirming funds", async () => {
    const sender = await createUser("resubmit-sender@example.com", Role.SENDER);
    const admin = await createUser("resubmit-admin@example.com", Role.ADMIN);
    const staff = await createUser("resubmit-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.FUNDING_REVIEW].map((capability) => ({ staffUserId: staff.id, capability, grantedByUserId: admin.id, reason: "Resubmission test" }))
    });
    const template = await database.fundingInstructionTemplate.create({
      data: { name: "Resubmit account", method: FundingMethod.BANK_TRANSFER, currency: "AED", payeeName: "Hawelly", instructions: "Use your reference.", createdByStaffId: admin.id }
    });
    const senderToken = await accessToken(sender.email);
    const staffToken = await accessToken(staff.email);
    const transferId = await createAcceptedTransfer(senderToken, staffToken);
    await request(app).post(`/operations/transfers/${transferId}/funding-instruction`).set(authenticated(staffToken)).send({ templateId: template.id, senderReference: "HW-RESUBMIT" });

    const first = await request(app).post(`/transfers/${transferId}/funding-proofs`).set(authenticated(senderToken)).send({ reference: "UNCLEAR-REF" });
    expect(first.body.proof.status).toBe("SUBMITTED");
    const resubmit = await request(app).post(`/operations/transfers/${transferId}/funding-proofs/${first.body.proof.id}/review`).set(authenticated(staffToken)).send({ decision: "REQUEST_RESUBMISSION", reason: "Reference cannot be matched" });
    expect(resubmit.body.transferStatus).toBe("FUNDING_PENDING");
    const second = await request(app).post(`/transfers/${transferId}/funding-proofs`).set(authenticated(senderToken)).send({ reference: "WRONG-REF" });
    const rejected = await request(app).post(`/operations/transfers/${transferId}/funding-proofs/${second.body.proof.id}/review`).set(authenticated(staffToken)).send({ decision: "REJECT", reason: "Reference belongs to another payment" });
    expect(rejected.body.transferStatus).toBe("FUNDING_PENDING");
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).not.toBe(TransferStatus.FUNDS_CONFIRMED);
  });

  it("manages an internal payout case, private evidence, holds, and an exact payout report", async () => {
    const sender = await createUser("payout-sender@example.com", Role.SENDER);
    const otherSender = await createUser("payout-other@example.com", Role.SENDER);
    const admin = await createUser("payout-admin@example.com", Role.ADMIN);
    const staff = await createUser("payout-staff@example.com", Role.STAFF);
    const payoutOnlyStaff = await createUser("payout-only@example.com", Role.STAFF);
    const unprivileged = await createUser("payout-unprivileged@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({
      data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.PAYOUT_MANAGE, Capability.TRANSFER_HOLD, Capability.ASSOCIATE_VIEW, Capability.ASSOCIATE_MANAGE].map((capability) => ({
        staffUserId: staff.id,
        capability,
        grantedByUserId: admin.id,
        reason: "Payout workflow test"
      }))
    });
    await database.staffCapabilityGrant.create({ data: { staffUserId: payoutOnlyStaff.id, capability: Capability.PAYOUT_MANAGE, grantedByUserId: admin.id, reason: "Payout without hold capability" } });
    const senderToken = await accessToken(sender.email);
    const otherToken = await accessToken(otherSender.email);
    const staffToken = await accessToken(staff.email);
    const payoutOnlyToken = await accessToken(payoutOnlyStaff.email);
    const unprivilegedToken = await accessToken(unprivileged.email);

    expect((await request(app).post("/operations/associates").set(authenticated(unprivilegedToken)).send({})).status).toBe(403);
    const associate = await request(app).post("/operations/associates").set(authenticated(staffToken)).send({
      businessName: "Manila Trusted Payout Desk",
      countries: ["ph"],
      cities: ["Manila"],
      payoutMethods: ["BANK_TRANSFER"],
      currencies: ["php"],
      contactChannels: { operationsEmail: "ops@example.test", phone: "+639171234567" },
      trustNotes: "Verified through internal onboarding"
    });
    expect(associate.status).toBe(201);
    expect(associate.body.associate).toMatchObject({ countries: ["PH"], currencies: ["PHP"], status: "ACTIVE" });

    const transferId = await createAcceptedTransfer(senderToken, staffToken);
    const deadline = new Date(now.getTime() + 86_400_000).toISOString();
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-case`).set(authenticated(staffToken)).send({ expectedBy: deadline })).status).toBe(409);
    await database.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.FUNDS_CONFIRMED } });
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-case`).set(authenticated(unprivilegedToken)).send({ expectedBy: deadline })).status).toBe(403);
    const created = await request(app).post(`/operations/transfers/${transferId}/payout-case`).set(authenticated(staffToken)).send({
      associateContactId: associate.body.associate.id,
      expectedBy: deadline,
      internalNote: "Coordinate externally after evidence is received",
      senderFacingNote: "Your payout is being coordinated."
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      transferStatus: "PAYOUT_IN_PROGRESS",
      payoutCase: { amountMinor: "1852813", currency: "PHP", payoutMethod: "BANK_TRANSFER", status: "IN_PROGRESS" }
    });
    const operationsView = await request(app).get(`/operations/transfers/${transferId}/payout`).set(authenticated(staffToken));
    expect(operationsView.body.payoutCase.staffOwner).toMatchObject({ id: staff.id, fullName: "STAFF Test User" });
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-case`).set(authenticated(staffToken)).send({ expectedBy: deadline })).status).toBe(409);

    expect((await request(app).get(`/transfers/${transferId}/payout`).set(authenticated(otherToken))).status).toBe(404);
    const senderView = await request(app).get(`/transfers/${transferId}/payout`).set(authenticated(senderToken));
    expect(senderView.body).toMatchObject({ transferStatus: "PAYOUT_IN_PROGRESS", payout: { amountMinor: "1852813", currency: "PHP", status: "IN_PROGRESS" } });
    expect(JSON.stringify(senderView.body)).not.toMatch(/Manila Trusted|operationsEmail|externalReference|internalNote|staffOwnerId|evidence/i);

    const receipt = Buffer.from("%PDF-1.4\npayout receipt\n%%EOF", "utf8");
    const evidence = await request(app).post(`/operations/transfers/${transferId}/payout-evidence`).set(authenticated(staffToken)).send({
      externalReference: "PAYOUT-EXT-100",
      attachment: { filename: "payout.pdf", contentType: "application/pdf", sizeBytes: receipt.byteLength }
    });
    expect(evidence.status).toBe(201);
    const uploadUrl = new URL(evidence.body.upload.url);
    uploadUrl.searchParams.set("signature", "A".repeat(43));
    expect((await request(app).put(`${uploadUrl.pathname}${uploadUrl.search}`).set("Content-Type", "application/pdf").send(receipt)).status).toBe(403);
    const validUploadUrl = new URL(evidence.body.upload.url);
    expect((await request(app).put(`${validUploadUrl.pathname}${validUploadUrl.search}`).set("Content-Type", "application/pdf").send(receipt)).status).toBe(200);
    const evidenceId = evidence.body.evidence.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-evidence/${evidenceId}/read-url`).set(authenticated(unprivilegedToken)).send({})).status).toBe(403);
    const readGrant = await request(app).post(`/operations/transfers/${transferId}/payout-evidence/${evidenceId}/read-url`).set(authenticated(staffToken)).send({});
    const readUrl = new URL(readGrant.body.url);
    const download = await request(app).get(`${readUrl.pathname}${readUrl.search}`);
    expect(download.status).toBe(200);
    expect(download.headers["cache-control"]).toContain("no-store");
    expect(Buffer.compare(download.body as Buffer, receipt)).toBe(0);

    expect((await request(app).post(`/operations/transfers/${transferId}/payout-hold`).set(authenticated(payoutOnlyToken)).send({ reason: "Unauthorized hold" })).status).toBe(403);
    await database.associateContact.update({ where: { id: associate.body.associate.id }, data: { status: "SUSPENDED" } });
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({ completedAmountMinor: "1852813", currency: "PHP", completedAt: now.toISOString() })).status).toBe(400);
    await database.associateContact.update({ where: { id: associate.body.associate.id }, data: { status: "ACTIVE" } });
    const held = await request(app).post(`/operations/transfers/${transferId}/payout-hold`).set(authenticated(staffToken)).send({ reason: "Associate requested callback", senderFacingNote: "The payout needs an additional operational check." });
    expect(held.body).toMatchObject({ transferStatus: "ON_HOLD", payoutCase: { status: "ON_HOLD" } });
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({ completedAmountMinor: "1852813", currency: "PHP", completedAt: now.toISOString() })).status).toBe(409);
    const released = await request(app).post(`/operations/transfers/${transferId}/payout-release`).set(authenticated(staffToken)).send({ reason: "Callback completed", senderFacingNote: "Your payout is moving again." });
    expect(released.body).toMatchObject({ transferStatus: "PAYOUT_IN_PROGRESS", payoutCase: { status: "IN_PROGRESS" } });

    expect((await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({ completedAmountMinor: "1", currency: "PHP", completedAt: now.toISOString() })).status).toBe(409);
    const reported = await request(app).post(`/operations/transfers/${transferId}/payout-report`).set(authenticated(staffToken)).send({
      completedAmountMinor: "1852813",
      currency: "PHP",
      completedAt: now.toISOString(),
      senderFacingNote: "The payout has been sent to your recipient."
    });
    expect(reported.body).toMatchObject({ transferStatus: "PAYOUT_REPORTED", payoutCase: { status: "REPORTED", completedAmountMinor: "1852813", completedCurrency: "PHP" } });
    expect(await database.transferConfirmation.count({ where: { transferRequestId: transferId, source: "STAFF", actorUserId: staff.id } })).toBe(1);
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.PAYOUT_REPORTED);
    await expect(database.payoutCase.update({ where: { id: created.body.payoutCase.id }, data: { amountMinor: 1n } })).rejects.toThrow(/financial snapshot is immutable/i);
    await expect(database.payoutEvidence.update({ where: { id: evidenceId }, data: { externalReference: "rewritten" } })).rejects.toThrow(/evidence snapshot is immutable/i);
    await expect(database.payoutEvidence.delete({ where: { id: evidenceId } })).rejects.toThrow(/history cannot be deleted/i);
    expect((await request(app).post(`/operations/transfers/${transferId}/payout-evidence`).set(authenticated(staffToken)).send({ externalReference: "LATE" })).status).toBe(409);

    const senderReported = await request(app).get(`/transfers/${transferId}/payout`).set(authenticated(senderToken));
    expect(senderReported.body).toMatchObject({ transferStatus: "PAYOUT_REPORTED", payout: { status: "REPORTED", completedAt: now.toISOString() } });
    expect(JSON.stringify(senderReported.body)).not.toMatch(/PAYOUT-EXT-100|Manila Trusted|ops@example|internal/i);
    const actions = await database.activityEvent.findMany({ where: { entityId: { in: [transferId, evidenceId, associate.body.associate.id, Capability.PAYOUT_MANAGE] } }, select: { actionType: true } });
    expect(actions.map((event) => event.actionType)).toEqual(expect.arrayContaining(["AUTHORIZATION_DENIED", "ASSOCIATE_CONTACT_CREATED", "PAYOUT_STARTED", "PAYOUT_EVIDENCE_RECORDED", "PAYOUT_ON_HOLD", "PAYOUT_HOLD_RELEASED", "PAYOUT_REPORTED"]));
  });

  it("records staff and sender confirmation signals before completing a transfer", async () => {
    const sender = await createUser("confirmation-sender@example.com", Role.SENDER);
    const other = await createUser("confirmation-other@example.com", Role.SENDER);
    const admin = await createUser("confirmation-admin@example.com", Role.ADMIN);
    const staff = await createUser("confirmation-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({ data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.PAYOUT_MANAGE].map((capability) => ({ staffUserId: staff.id, capability, grantedByUserId: admin.id, reason: "Confirmation test" })) });
    const senderToken = await accessToken(sender.email); const otherToken = await accessToken(other.email); const staffToken = await accessToken(staff.email); const adminToken = await accessToken(admin.email);
    const transferId = await createReportedPayout(senderToken, staffToken, staff.id);

    expect((await request(app).post(`/transfers/${transferId}/recipient-confirmation`).set(authenticated(senderToken)).send({})).status).toBe(409);
    expect((await request(app).post(`/transfers/${transferId}/recipient-confirmation`).set(authenticated(otherToken)).send({})).status).toBe(404);
    const requested = await request(app).post(`/operations/transfers/${transferId}/confirmation-request`).set(authenticated(staffToken)).send({ note: "Please confirm receipt" });
    expect(requested.body.transferStatus).toBe("CONFIRMATION_PENDING");
    const confirmed = await request(app).post(`/transfers/${transferId}/recipient-confirmation`).set(authenticated(senderToken)).send({ note: "My recipient received the money" });
    expect(confirmed.body.transferStatus).toBe("COMPLETED");
    expect((await request(app).post(`/transfers/${transferId}/recipient-confirmation`).set(authenticated(senderToken)).send({})).status).toBe(409);
    const confirmations = await database.transferConfirmation.findMany({ where: { transferRequestId: transferId }, orderBy: { confirmedAt: "asc" } });
    expect(confirmations.map((item) => item.source)).toEqual(["STAFF", "SENDER"]);
    await expect(database.transferConfirmation.update({ where: { id: confirmations[0]!.id }, data: { note: "rewritten" } })).rejects.toThrow(/confirmation history is immutable/i);
    await expect(database.transferConfirmation.delete({ where: { id: confirmations[1]!.id } })).rejects.toThrow(/confirmation history cannot be deleted/i);
    const senderState = await request(app).get(`/transfers/${transferId}/resolution`).set(authenticated(senderToken));
    expect(senderState.body).toMatchObject({ transferStatus: "COMPLETED", confirmations: [{ source: "STAFF" }, { source: "SENDER" }] });
    expect(JSON.stringify(senderState.body)).not.toContain(staff.id);

    const overrideTransferId = await createReportedPayout(senderToken, staffToken, staff.id);
    expect((await request(app).post(`/operations/transfers/${overrideTransferId}/admin-completion`).set(authenticated(staffToken)).send({ reason: "Unauthorized override" })).status).toBe(403);
    const overridden = await request(app).post(`/operations/transfers/${overrideTransferId}/admin-completion`).set(authenticated(adminToken)).send({ reason: "Approved staff-evidence completion" });
    expect(overridden.body.transferStatus).toBe("COMPLETED");
  });

  it("routes a sender dispute through reviewed refund and admin confirmation", async () => {
    const sender = await createUser("dispute-sender@example.com", Role.SENDER);
    const admin = await createUser("dispute-admin@example.com", Role.ADMIN);
    const staff = await createUser("dispute-staff@example.com", Role.STAFF);
    const disputeOnly = await createUser("dispute-only@example.com", Role.STAFF);
    const unprivileged = await createUser("dispute-unprivileged@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({ data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.PAYOUT_MANAGE, Capability.DISPUTE_MANAGE, Capability.REFUND_MANAGE].map((capability) => ({ staffUserId: staff.id, capability, grantedByUserId: admin.id, reason: "Dispute test" })) });
    await database.staffCapabilityGrant.createMany({ data: [Capability.TRANSFER_REVIEW, Capability.DISPUTE_MANAGE].map((capability) => ({ staffUserId: disputeOnly.id, capability, grantedByUserId: admin.id, reason: "Dispute-only test" })) });
    const senderToken = await accessToken(sender.email); const staffToken = await accessToken(staff.email); const adminToken = await accessToken(admin.email); const disputeOnlyToken = await accessToken(disputeOnly.email); const unprivilegedToken = await accessToken(unprivileged.email);
    const transferId = await createReportedPayout(senderToken, staffToken, staff.id);
    await request(app).post(`/operations/transfers/${transferId}/confirmation-request`).set(authenticated(staffToken)).send({});
    const opened = await request(app).post(`/transfers/${transferId}/disputes`).set(authenticated(senderToken)).send({ category: "RECIPIENT_NOT_PAID", reason: "Recipient has not received the payout" });
    expect(opened.status).toBe(201);
    expect(opened.body.transferStatus).toBe("DISPUTED");
    const disputeId = opened.body.dispute.id as string;
    expect((await request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/review`).set(authenticated(unprivilegedToken)).send({})).status).toBe(403);
    expect((await request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/resolve`).set(authenticated(disputeOnlyToken)).send({ action: "REFUND", resolution: "Unauthorized refund", senderFacingReason: "Refund" })).status).toBe(403);
    expect(await database.refundCase.findUnique({ where: { transferRequestId: transferId } })).toBeNull();
    expect((await request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/review`).set(authenticated(staffToken)).send({})).body.dispute.status).toBe("IN_REVIEW");
    const resolved = await request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/resolve`).set(authenticated(staffToken)).send({ action: "REFUND", resolution: "Payout could not be confirmed; return sender funds", senderFacingReason: "We are returning your funds." });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body.transferStatus).toBe("REFUND_PENDING");
    expect((await database.payoutCase.findUniqueOrThrow({ where: { transferRequestId: transferId } })).status).toBe("FAILED");
    expect((await request(app).post(`/operations/transfers/${transferId}/refund-confirmation`).set(authenticated(staffToken)).send({ externalReference: "REF-STAFF", refundedAt: now.toISOString(), reason: "Staff cannot confirm" })).status).toBe(403);
    const refunded = await request(app).post(`/operations/transfers/${transferId}/refund-confirmation`).set(authenticated(adminToken)).send({ externalReference: "REFUND-ADMIN-100", refundedAt: now.toISOString(), reason: "Refund visible in sender account" });
    expect(refunded.body).toMatchObject({ transferStatus: "REFUNDED", refund: { amountMinor: "125000", currency: "AED", status: "REFUNDED" } });
    const senderState = await request(app).get(`/transfers/${transferId}/resolution`).set(authenticated(senderToken));
    expect(senderState.body).toMatchObject({ transferStatus: "REFUNDED", refund: { senderFacingReason: "We are returning your funds.", status: "REFUNDED" } });
    expect(JSON.stringify(senderState.body)).not.toMatch(/REFUND-ADMIN-100|return sender funds|externalReference/i);
    const refund = await database.refundCase.findUniqueOrThrow({ where: { transferRequestId: transferId } });
    await expect(database.refundCase.update({ where: { id: refund.id }, data: { amountMinor: 1n } })).rejects.toThrow(/refund snapshot is immutable/i);
    await expect(database.refundCase.delete({ where: { id: refund.id } })).rejects.toThrow(/refund history cannot be deleted/i);
    await expect(database.dispute.update({ where: { id: disputeId }, data: { resolution: "rewritten" } })).rejects.toThrow(/resolved dispute is immutable/i);
    await expect(database.dispute.delete({ where: { id: disputeId } })).rejects.toThrow(/dispute history cannot be deleted/i);
  });

  it("serializes dispute claim and resolution without overwriting accountability", async () => {
    const sender = await createUser("dispute-race-sender@example.com", Role.SENDER);
    const admin = await createUser("dispute-race-admin@example.com", Role.ADMIN);
    const reviewer = await createUser("dispute-race-reviewer@example.com", Role.STAFF);
    const resolver = await createUser("dispute-race-resolver@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({ data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.PAYOUT_MANAGE, Capability.DISPUTE_MANAGE].map((capability) => ({ staffUserId: reviewer.id, capability, grantedByUserId: admin.id, reason: "Dispute race test" })) });
    await database.staffCapabilityGrant.create({ data: { staffUserId: resolver.id, capability: Capability.DISPUTE_MANAGE, grantedByUserId: admin.id, reason: "Dispute race test" } });
    const senderToken = await accessToken(sender.email); const reviewerToken = await accessToken(reviewer.email); const resolverToken = await accessToken(resolver.email);
    const transferId = await createReportedPayout(senderToken, reviewerToken, reviewer.id);
    const opened = await request(app).post(`/transfers/${transferId}/disputes`).set(authenticated(senderToken)).send({ category: "PAYOUT_DELAYED", reason: "Please review the payout" });
    const disputeId = opened.body.dispute.id as string;

    const [claim, resolution] = await Promise.all([
      request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/review`).set(authenticated(reviewerToken)).send({}),
      request(app).post(`/operations/transfers/${transferId}/disputes/${disputeId}/resolve`).set(authenticated(resolverToken)).send({ action: "RESUME", resolution: "Operational review completed" })
    ]);
    expect(resolution.status, JSON.stringify(resolution.body)).toBe(200);
    expect([200, 404]).toContain(claim.status);
    const saved = await database.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    expect(saved.assignedToStaffId).toBe(claim.status === 200 ? reviewer.id : resolver.id);
  });

  it("blocks resume when a migrated dispute has no verified prior-state snapshot", async () => {
    const sender = await createUser("legacy-dispute-sender@example.com", Role.SENDER);
    const admin = await createUser("legacy-dispute-admin@example.com", Role.ADMIN);
    const staff = await createUser("legacy-dispute-staff@example.com", Role.STAFF);
    await database.staffCapabilityGrant.createMany({ data: [Capability.TRANSFER_REVIEW, Capability.QUOTE_MANAGE, Capability.PAYOUT_MANAGE, Capability.DISPUTE_MANAGE].map((capability) => ({ staffUserId: staff.id, capability, grantedByUserId: admin.id, reason: "Legacy dispute test" })) });
    const senderToken = await accessToken(sender.email); const staffToken = await accessToken(staff.email);
    const transferId = await createReportedPayout(senderToken, staffToken, staff.id);
    await database.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.DISPUTED } });
    const dispute = await database.dispute.create({ data: { transferRequestId: transferId, openedByUserId: sender.id, category: "OTHER", reason: "Imported dispute", previousTransferStatus: TransferStatus.PAYOUT_REPORTED, previousTransferStatusVerified: false, openedAt: now } });

    const response = await request(app).post(`/operations/transfers/${transferId}/disputes/${dispute.id}/resolve`).set(authenticated(staffToken)).send({ action: "RESUME", resolution: "Attempt unsafe resume" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DISPUTE_RESUME_UNSAFE");
    expect((await database.transferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(TransferStatus.DISPUTED);
  });
});
