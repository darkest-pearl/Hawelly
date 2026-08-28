import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AuthConfig } from "../auth/config.js";
import { hashPassword } from "../auth/password.js";
import { AuthService, type AuthPrincipal } from "../auth/service.js";
import { createPrismaClient } from "../db/prisma.js";
import { ActivitySource, Capability, PayoutMethod, Role, UserStatus } from "../generated/prisma/client.js";
import { resolveTestDatabaseUrl } from "../testSupport/database.js";
import { TransferWorkflowService } from "../transfers/service.js";
import { AdminWorkflowService } from "./service.js";
import { DatabaseRuntimeConfigurationProvider } from "./runtimeConfiguration.js";

const databaseUrl = resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const integrationDescribe = databaseUrl ? describe : describe.skip;
const runtimeConfig = { host: "127.0.0.1", port: 4000, environment: "test", corsOrigins: ["http://localhost:3000"], trustedBffAddresses: ["127.0.0.1", "::1", "::ffff:127.0.0.1"] } as const;
const authConfig: AuthConfig = {
  accessSecret: new TextEncoder().encode("admin-test-access-secret-is-at-least-32-bytes"),
  rateLimitPepper: "admin-test-rate-limit-pepper-is-at-least-32-bytes",
  accessTtlSeconds: 900, refreshTtlSeconds: 604_800, sessionAbsoluteTtlSeconds: 2_592_000,
  registrationWindowSeconds: 3_600, registrationIpMaxAttempts: 20,
  loginWindowSeconds: 900, loginIpMaxFailures: 100, loginIdentifierMaxFailures: 20, loginAccountMaxFailures: 20,
  issuer: "hawelly-api", audience: "hawelly-clients"
};

integrationDescribe("admin configuration and operations", () => {
  const database = createPrismaClient(databaseUrl || "postgresql://invalid");
  let now = new Date();
  const auth = new AuthService(database, authConfig, () => new Date(now));
  const runtimeConfiguration = new DatabaseRuntimeConfigurationProvider(database);
  const admin = new AdminWorkflowService(database, { maximumProofBytes: 8 * 1024 * 1024, allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"] }, () => new Date(now));
  const app = createApp(runtimeConfig, { authService: auth, adminWorkflowService: admin });

  async function createUser(email: string, role: Role) {
    return database.user.create({ data: {
      fullName: `${role} Test User`, email, passwordHash: await hashPassword("CorrectHorse123"), role, status: UserStatus.ACTIVE, passwordChangedAt: now,
      ...(role === Role.STAFF || role === Role.ADMIN ? { staffProfile: { create: { displayName: `${role} Test User` } } } : {})
    } });
  }
  async function token(email: string, password = "CorrectHorse123") {
    const response = await request(app).post("/auth/login").send({ email, password });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.accessToken as string;
  }
  const bearer = (value: string) => ({ Authorization: `Bearer ${value}` });
  const configuration = (overrides: Record<string, unknown> = {}) => ({
    quoteSlaMinutes: 20, quoteDefaultExpiryMinutes: 15,
    supportedOriginCountries: ["AE"], supportedDestinationCountries: ["GB"], supportedCurrencies: ["AED"],
    payoutMethodsByDestination: { GB: ["BANK_TRANSFER"] }, evidenceMaxSizeBytes: 2_000_000,
    evidenceAllowedContentTypes: ["application/pdf"], transferLimitsByCurrency: { AED: { maximumAmountMinor: "500000" } },
    broadcastMessage: "Service is operating normally.", maintenanceMessage: null,
    reason: "Approved beta policy", confirmed: true, ...overrides
  });

  beforeAll(async () => { await database.$connect(); });
  beforeEach(async () => {
    now = new Date();
    await database.$executeRawUnsafe(`TRUNCATE TABLE "ActivityEvent", "AdminConfiguration", "StaffCapabilityGrant", "AuthRateLimit", "AuthSession", "TransferRequest", "Recipient", "StaffProfile", "User" CASCADE`);
  });
  afterAll(async () => { await database.$disconnect(); });

  it("keeps admin routes admin-only and creates staff without exposing credential material", async () => {
    const adminUser = await createUser("admin-access@example.com", Role.ADMIN);
    const sender = await createUser("sender-access@example.com", Role.SENDER);
    const adminToken = await token(adminUser.email); const senderToken = await token(sender.email);
    const denied = await request(app).get("/admin/staff").set(bearer(senderToken));
    expect(denied.status).toBe(403);
    expect(await database.activityEvent.count({ where: { actorUserId: sender.id, actionType: "AUTHORIZATION_DENIED" } })).toBe(1);

    const missingConfirmation = await request(app).post("/admin/staff").set(bearer(adminToken)).send({ fullName: "New Staff", email: "new-staff@example.com", temporaryPassword: "TemporaryPass123", capabilities: [Capability.TRANSFER_REVIEW], reason: "Create staff" });
    expect(missingConfirmation.status).toBe(400);
    const created = await request(app).post("/admin/staff").set(bearer(adminToken)).send({ fullName: "New Staff", email: "new-staff@example.com", temporaryPassword: "TemporaryPass123", capabilities: [Capability.TRANSFER_REVIEW], reason: "Create operations reviewer", confirmed: true });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.staff).toMatchObject({ email: "new-staff@example.com", status: "ACTIVE", capabilities: ["TRANSFER_REVIEW"] });
    expect(JSON.stringify(created.body)).not.toMatch(/TemporaryPass123|passwordHash/i);

    const staffToken = await token("new-staff@example.com", "TemporaryPass123");
    const granted = await request(app).post(`/admin/staff/${created.body.staff.id}/capabilities`).set(bearer(adminToken)).send({ capability: Capability.QUOTE_MANAGE, reason: "Prepare sender quotes", confirmed: true });
    expect(granted.body.staff.capabilities).toEqual(["QUOTE_MANAGE", "TRANSFER_REVIEW"]);
    expect((await request(app).get("/me").set(bearer(staffToken))).status).toBe(401);
    const stored = await database.user.findUniqueOrThrow({ where: { id: created.body.staff.id } });
    expect(stored.sessionVersion).toBe(1);
  });

  it("activates immutable configuration versions and applies them to sender policy", async () => {
    const adminUser = await createUser("admin-config@example.com", Role.ADMIN);
    const sender = await createUser("sender-config@example.com", Role.SENDER);
    const adminToken = await token(adminUser.email);
    expect((await request(app).post("/admin/configuration").set(bearer(adminToken)).send(configuration({ confirmed: false }))).status).toBe(400);
    const first = await request(app).post("/admin/configuration").set(bearer(adminToken)).send(configuration());
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.configuration).toMatchObject({ version: 1, active: true, quoteSlaMinutes: 20 });
    expect((await runtimeConfiguration.getActive())?.transferLimitsByCurrency.AED?.maximumAmountMinor).toBe("500000");

    const principal: AuthPrincipal = { userId: sender.id, sessionId: "00000000-0000-4000-8000-000000000001", role: Role.SENDER, status: UserStatus.ACTIVE, capabilities: [] };
    const transfers = new TransferWorkflowService(database, { quoteSlaMinutes: 45, corridors: [{ originCountry: "AE", destinationCountry: "PH", sendCurrencies: ["AED"], payoutMethods: [PayoutMethod.BANK_TRANSFER] }] }, () => new Date(now), undefined, runtimeConfiguration);
    const context = { requestId: "admin-runtime-test", source: ActivitySource.API, ipAddress: "127.0.0.1", userAgent: "test" };
    await expect(transfers.createRecipient(principal, { fullName: "Blocked", country: "PH", payoutMethod: PayoutMethod.BANK_TRANSFER, payoutDetails: { accountName: "Blocked", bankName: "Bank", accountNumber: "123" } }, context)).rejects.toMatchObject({ code: "UNSUPPORTED_RECIPIENT_DESTINATION" });
    const recipient = await transfers.createRecipient(principal, { fullName: "Allowed", country: "GB", payoutMethod: PayoutMethod.BANK_TRANSFER, payoutDetails: { accountName: "Allowed", bankName: "Bank", accountNumber: "123" } }, context);
    await expect(transfers.createTransfer(principal, { recipientId: recipient.id, originCountry: "AE", destinationCountry: "GB", sendAmountMinor: "500001", sendCurrency: "AED", requestedPayoutMethod: PayoutMethod.BANK_TRANSFER }, context)).rejects.toMatchObject({ code: "TRANSFER_LIMIT_EXCEEDED" });

    const second = await request(app).post("/admin/configuration").set(bearer(adminToken)).send(configuration({ quoteSlaMinutes: 25, reason: "Adjust quote response target" }));
    expect(second.body.configuration.version).toBe(2);
    const old = await database.adminConfiguration.findUniqueOrThrow({ where: { version: 1 } });
    await expect(database.adminConfiguration.update({ where: { id: old.id }, data: { quoteSlaMinutes: 30 } })).rejects.toThrow(/snapshots are immutable/i);
    await expect(database.adminConfiguration.delete({ where: { id: old.id } })).rejects.toThrow(/cannot be deleted/i);
  });

  it("audits template administration and exposes overdue operational work", async () => {
    const adminUser = await createUser("admin-ops@example.com", Role.ADMIN);
    const sender = await createUser("sender-ops@example.com", Role.SENDER);
    const adminToken = await token(adminUser.email);
    const template = await request(app).post("/admin/funding-templates").set(bearer(adminToken)).send({ name: "AED account", method: "BANK_TRANSFER", currency: "AED", payeeName: "Hawelly", provider: null, accountReference: "Account 100", instructions: "Use your transfer reference.", reason: "Add approved funding account", confirmed: true });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    await database.recipient.create({ data: { ownerSenderId: sender.id, fullName: "Recipient", country: "PH", payoutMethod: PayoutMethod.BANK_TRANSFER, payoutDetails: { accountName: "Recipient", bankName: "Bank", accountNumber: "123" } } });
    const recipient = await database.recipient.findFirstOrThrow({ where: { ownerSenderId: sender.id } });
    await database.transferRequest.create({ data: { reference: "HW-ADMIN-OVERDUE", senderId: sender.id, recipientId: recipient.id, originCountry: "AE", destinationCountry: "PH", sendAmountMinor: 10_000n, sendCurrency: "AED", requestedPayoutMethod: PayoutMethod.BANK_TRANSFER, recipientSnapshot: { fullName: "Recipient" }, createdAt: new Date(now.getTime() - 120_000), quoteDueAt: new Date(now.getTime() - 60_000) } });
    const dashboard = await request(app).get("/admin/dashboard").set(bearer(adminToken));
    expect(dashboard.body.counts.overdueQuotes).toBe(1);
    expect(dashboard.body.workItems[0]).toMatchObject({ reference: "HW-ADMIN-OVERDUE", category: "OVERDUE_QUOTE" });
    const activity = await request(app).get("/admin/activity").set(bearer(adminToken));
    expect(activity.body.events.some((event: { actionType: string; reason: string }) => event.actionType === "FUNDING_TEMPLATE_CREATED" && event.reason === "Add approved funding account")).toBe(true);
    expect(JSON.stringify(activity.body)).not.toMatch(/CorrectHorse123|TemporaryPass123|passwordHash/i);
  });
});
