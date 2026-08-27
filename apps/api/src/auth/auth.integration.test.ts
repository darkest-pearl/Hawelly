import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AuthConfig } from "./config.js";
import { createPrismaClient } from "../db/prisma.js";
import {
  ActivityOutcome,
  ActivitySource,
  Capability,
  Role,
  UserStatus
} from "../generated/prisma/client.js";
import {
  requireAuth,
  requireCapability,
  requireRole
} from "../middleware/auth.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { authErrorResponse } from "./router.js";
import { sanitizeAuditValue } from "./audit.js";
import { hashPassword } from "./password.js";
import { AuthService } from "./service.js";
import { resolveTestDatabaseUrl } from "../testSupport/database.js";

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
    "test-access-secret-is-distinct-and-at-least-32-bytes"
  ),
  rateLimitPepper: "test-rate-limit-pepper-is-distinct-and-at-least-32-bytes",
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604_800,
  sessionAbsoluteTtlSeconds: 2_592_000,
  registrationWindowSeconds: 3_600,
  registrationIpMaxAttempts: 3,
  loginWindowSeconds: 900,
  loginIpMaxFailures: 100,
  loginIdentifierMaxFailures: 3,
  loginAccountMaxFailures: 4,
  issuer: "hawelly-api",
  audience: "hawelly-clients"
};

integrationDescribe("database-backed authentication", () => {
  const database = createPrismaClient(databaseUrl || "postgresql://invalid");
  let now = new Date();
  const authService = new AuthService(database, authConfig, () => new Date(now));
  const app = createApp(runtimeConfig, {
    authService,
    readinessCheck: async () => {
      await database.$queryRaw`SELECT 1`;
    }
  });

  async function createUser(
    email: string,
    role: Role,
    status = UserStatus.ACTIVE,
    password = "CorrectHorse123"
  ) {
    const user = await database.user.create({
      data: {
        fullName: `${role} Test User`,
        email,
        passwordHash: await hashPassword(password),
        role,
        status,
        passwordChangedAt: now,
        staffProfile:
          role === Role.STAFF || role === Role.ADMIN
            ? {
                create: {
                  displayName: `${role} Test User`
                }
              }
            : undefined
      }
    });
    return { user, password };
  }

  async function login(email: string, password = "CorrectHorse123") {
    return request(app).post("/auth/login").send({ email, password });
  }

  beforeAll(async () => {
    await database.$connect();
  });

  beforeEach(async () => {
    now = new Date();
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE
        "ActivityEvent",
        "StaffCapabilityGrant",
        "AuthRateLimit",
        "AuthSession",
        "StaffProfile",
        "User"
      CASCADE
    `);
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it("registers only an active sender and keeps password/session material out of audits", async () => {
    const password = "A-secure-sender-password-123";
    const response = await request(app).post("/auth/register").send({
      fullName: "Sender One",
      email: "SENDER@EXAMPLE.COM",
      password
    });

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.user.role).toBe(Role.SENDER);
    expect(response.body.user.status).toBe(UserStatus.ACTIVE);
    expect(response.body.accessToken).toBeTypeOf("string");
    expect(response.body.refreshToken).toMatch(/^hwr1\./);

    const stored = await database.user.findUniqueOrThrow({
      where: { email: "sender@example.com" }
    });
    expect(stored.passwordHash).not.toBe(password);
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.role).toBe(Role.SENDER);

    const session = await database.authSession.findFirstOrThrow({
      where: { userId: stored.id }
    });
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toContain(response.body.refreshToken);

    const activities = await database.activityEvent.findMany();
    const serialized = JSON.stringify(activities);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(response.body.accessToken);
    expect(serialized).not.toContain(response.body.refreshToken);

    const injectedRole = await request(app).post("/auth/register").send({
      fullName: "Role Injection",
      email: "injection@example.com",
      password,
      role: Role.ADMIN
    });
    expect(injectedRole.status).toBe(400);
    expect(await database.user.count({ where: { email: "injection@example.com" } })).toBe(
      0
    );
  });

  it("limits public registration before additional Argon2 work", async () => {
    const password = "A-secure-sender-password-123";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).post("/auth/register").send({
        fullName: `Registration Attempt ${attempt}`,
        email: "registration-limit@example.com",
        password
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([201, 409, 409]);

    const blocked = await request(app).post("/auth/register").send({
      fullName: "Blocked Registration",
      email: "different-registration@example.com",
      password
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("3600");
  });

  it("logs in sender, staff, and admin and returns a safe current /me projection", async () => {
    for (const role of [Role.SENDER, Role.STAFF, Role.ADMIN]) {
      const email = `${role.toLowerCase()}@example.com`;
      await createUser(email, role);
      const response = await login(email);
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe(role);

      const me = await request(app)
        .get("/me")
        .set("Authorization", `Bearer ${response.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.headers["cache-control"]).toBe("no-store");
      expect(me.body.role).toBe(role);
      expect(me.body.passwordHash).toBeUndefined();
      expect(me.body.session.tokenHash).toBeUndefined();
    }
  });

  it("uses one generic failure for unknown, wrong-password, and inactive accounts", async () => {
    await createUser("active@example.com", Role.SENDER);
    await createUser("inactive@example.com", Role.SENDER, UserStatus.INACTIVE);

    const unknown = await login("unknown@example.com", "WrongPassword123");
    const wrong = await login("active@example.com", "WrongPassword123");
    const inactive = await login("inactive@example.com", "CorrectHorse123");

    for (const response of [unknown, wrong, inactive]) {
      expect(response.status).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toEqual({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" }
      });
    }
  });

  it("blocks at the configured identifier threshold and supplies Retry-After", async () => {
    await createUser("limited@example.com", Role.SENDER);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const failed = await login("limited@example.com", "WrongPassword123");
      expect(failed.status).toBe(401);
    }

    const blocked = await login("limited@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
    expect(blocked.body.error.code).toBe("RATE_LIMITED");

    now = new Date(now.getTime() + 901_000);
    const allowed = await login("limited@example.com");
    expect(allowed.status).toBe(200);
  });

  it("isolates trusted BFF login clients while retaining per-client limits", async () => {
    await createUser("bff-valid@example.com", Role.SENDER);
    const strictAuth = new AuthService(database, {
      ...authConfig,
      loginIpMaxFailures: 2,
      loginIdentifierMaxFailures: 20,
      loginAccountMaxFailures: 20
    });
    const strictApp = createApp(runtimeConfig, { authService: strictAuth });
    const clientA = "00000000-0000-4000-8000-000000000001";
    const clientB = "00000000-0000-4000-8000-000000000002";
    for (const email of ["guess-one@example.com", "guess-two@example.com"]) {
      const failed = await request(strictApp)
        .post("/auth/login")
        .set("X-Client-Source", "WEB")
        .set("X-Hawelly-BFF-Rate-Limit-Id", `client:${clientA}`)
        .send({ email, password: "WrongPassword123" });
      expect(failed.status).toBe(401);
    }
    const blockedA = await request(strictApp)
      .post("/auth/login")
      .set("X-Client-Source", "WEB")
      .set("X-Hawelly-BFF-Rate-Limit-Id", `client:${clientA}`)
      .send({ email: "guess-three@example.com", password: "WrongPassword123" });
    expect(blockedA.status).toBe(429);

    const allowedB = await request(strictApp)
      .post("/auth/login")
      .set("X-Client-Source", "WEB")
      .set("X-Hawelly-BFF-Rate-Limit-Id", `client:${clientB}`)
      .send({ email: "bff-valid@example.com", password: "CorrectHorse123" });
    expect(allowedB.status).toBe(200);

    for (const email of ["direct-one@example.com", "direct-two@example.com"]) {
      const failed = await request(strictApp)
        .post("/auth/login")
        .send({ email, password: "WrongPassword123" });
      expect(failed.status).toBe(401);
    }
    const directBlocked = await request(strictApp).post("/auth/login").send({
      email: "bff-valid@example.com",
      password: "CorrectHorse123"
    });
    expect(directBlocked.status).toBe(429);
  });

  it("rejects login attempts that arrive after a concurrent threshold is reached", async () => {
    await createUser("concurrent-limit@example.com", Role.SENDER);
    const failures = await Promise.all(
      Array.from({ length: 4 }, () =>
        login("concurrent-limit@example.com", "WrongPassword123")
      )
    );
    expect(failures.map((response) => response.status).sort()).toEqual([
      401,
      401,
      401,
      429
    ]);

    const blocked = await login("concurrent-limit@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
  });

  it("limits distributed guesses with an identifier-only bucket", async () => {
    await createUser("distributed-limit@example.com", Role.SENDER);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        authService.login(
          {
            email: "distributed-limit@example.com",
            password: "WrongPassword123"
          },
          {
            requestId: `distributed-${attempt}`,
            source: ActivitySource.API,
            ipAddress: `198.51.100.${attempt + 1}`,
            userAgent: "integration-test"
          }
        )
      ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    }

    await expect(
      authService.login(
        {
          email: "distributed-limit@example.com",
          password: "CorrectHorse123"
        },
        {
          requestId: "distributed-blocked",
          source: ActivitySource.API,
          ipAddress: "198.51.100.100",
          userAgent: "integration-test"
        }
      )
    ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("rotates refresh tokens and revokes the family when a rotated token is replayed", async () => {
    await createUser("rotation@example.com", Role.SENDER);
    const original = await login("rotation@example.com");
    const rotated = await request(app).post("/auth/refresh").send({
      refreshToken: original.body.refreshToken
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(original.body.refreshToken);

    const oldAccess = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${original.body.accessToken}`);
    expect(oldAccess.status).toBe(401);

    const replay = await request(app).post("/auth/refresh").send({
      refreshToken: original.body.refreshToken
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INVALID_SESSION");

    const replacementAccess = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${rotated.body.accessToken}`);
    expect(replacementAccess.status).toBe(401);
  });

  it("allows only one concurrent refresh consumer and revokes the raced family", async () => {
    await createUser("refresh-race@example.com", Role.SENDER);
    const original = await login("refresh-race@example.com");

    const results = await Promise.all([
      request(app).post("/auth/refresh").send({
        refreshToken: original.body.refreshToken
      }),
      request(app).post("/auth/refresh").send({
        refreshToken: original.body.refreshToken
      })
    ]);

    expect(results.map((response) => response.status).sort()).toEqual([200, 401]);
    const successful = results.find((response) => response.status === 200);
    expect(successful).toBeDefined();
    const replacementAccess = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${successful?.body.accessToken}`);
    expect(replacementAccess.status).toBe(401);
  });

  it("handles the same replay once without repeatedly invalidating sibling sessions", async () => {
    await createUser("idempotent-replay@example.com", Role.SENDER);
    const replayFamily = await login("idempotent-replay@example.com");
    const sibling = await login("idempotent-replay@example.com");
    const rotated = await request(app).post("/auth/refresh").send({
      refreshToken: replayFamily.body.refreshToken
    });
    expect(rotated.status).toBe(200);

    const firstReplay = await request(app).post("/auth/refresh").send({
      refreshToken: replayFamily.body.refreshToken
    });
    expect(firstReplay.status).toBe(401);

    const refreshedSibling = await request(app).post("/auth/refresh").send({
      refreshToken: sibling.body.refreshToken
    });
    expect(refreshedSibling.status).toBe(200);

    const repeatedReplay = await request(app).post("/auth/refresh").send({
      refreshToken: replayFamily.body.refreshToken
    });
    expect(repeatedReplay.status).toBe(401);
    const siblingAccess = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${refreshedSibling.body.accessToken}`);
    expect(siblingAccess.status).toBe(200);
  });

  it("revokes one session on logout without revoking a sibling session", async () => {
    await createUser("logout@example.com", Role.SENDER);
    const first = await login("logout@example.com");
    const second = await login("logout@example.com");

    const logout = await request(app).post("/auth/logout").send({
      refreshToken: first.body.refreshToken
    });
    expect(logout.status).toBe(204);

    const repeatedLogout = await request(app).post("/auth/logout").send({
      refreshToken: first.body.refreshToken
    });
    expect(repeatedLogout.status).toBe(204);

    expect(
      (
        await request(app)
          .get("/me")
          .set("Authorization", `Bearer ${first.body.accessToken}`)
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/me")
          .set("Authorization", `Bearer ${second.body.accessToken}`)
      ).status
    ).toBe(200);
  });

  it("revokes all sessions and immediately denies inactive users", async () => {
    const { user } = await createUser("all@example.com", Role.SENDER);
    const first = await login("all@example.com");
    const second = await login("all@example.com");

    const logoutAll = await request(app)
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${first.body.accessToken}`)
      .send({});
    expect(logoutAll.status).toBe(204);
    for (const accessToken of [first.body.accessToken, second.body.accessToken]) {
      const me = await request(app)
        .get("/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(401);
    }

    const relogin = await login("all@example.com");
    expect(relogin.status).toBe(200);
    await database.user.update({
      where: { id: user.id },
      data: { status: UserStatus.INACTIVE }
    });
    const inactiveMe = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${relogin.body.accessToken}`);
    expect(inactiveMe.status).toBe(401);
    const inactiveRefresh = await request(app).post("/auth/refresh").send({
      refreshToken: relogin.body.refreshToken
    });
    expect(inactiveRefresh.status).toBe(401);
  });

  it("enforces role and current staff capability boundaries", async () => {
    const { user: admin } = await createUser("admin-cap@example.com", Role.ADMIN);
    const { user: staff } = await createUser("staff-cap@example.com", Role.STAFF);
    const { user: sender } = await createUser("sender-cap@example.com", Role.SENDER);
    await database.staffCapabilityGrant.createMany({
      data: [
        {
          staffUserId: staff.id,
          capability: Capability.QUOTE_MANAGE,
          grantedByUserId: admin.id,
          reason: "Integration test"
        },
        {
          staffUserId: sender.id,
          capability: Capability.QUOTE_MANAGE,
          grantedByUserId: admin.id,
          reason: "Stray row must not elevate sender"
        }
      ]
    });

    const protectedApp = express();
    protectedApp.use(express.json());
    protectedApp.use(requestContextMiddleware);
    protectedApp.get(
      "/quote",
      requireAuth(authService),
      requireCapability(Capability.QUOTE_MANAGE),
      (_request, response) => response.json({ ok: true })
    );
    protectedApp.get(
      "/admin",
      requireAuth(authService),
      requireRole(Role.ADMIN),
      (_request, response) => response.json({ ok: true })
    );
    const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
      void next;
      if (!authErrorResponse(error, response)) {
        response.status(500).json({ error: "Internal server error" });
      }
    };
    protectedApp.use(errorHandler);

    const staffLogin = await login("staff-cap@example.com");
    const senderLogin = await login("sender-cap@example.com");
    const adminLogin = await login("admin-cap@example.com");
    expect(
      (
        await request(protectedApp)
          .get("/quote")
          .set("Authorization", `Bearer ${staffLogin.body.accessToken}`)
      ).status
    ).toBe(200);
    expect(
      (
        await request(protectedApp)
          .get("/quote")
          .set("Authorization", `Bearer ${senderLogin.body.accessToken}`)
      ).status
    ).toBe(403);
    expect(
      (
        await request(protectedApp)
          .get("/quote")
          .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
      ).status
    ).toBe(200);
    expect(
      (
        await request(protectedApp)
          .get("/admin")
          .set("Authorization", `Bearer ${staffLogin.body.accessToken}`)
      ).status
    ).toBe(403);

    await database.staffCapabilityGrant.updateMany({
      where: { staffUserId: staff.id, capability: Capability.QUOTE_MANAGE },
      data: { revokedAt: now, revokedByUserId: admin.id }
    });
    expect(
      (
        await request(protectedApp)
          .get("/quote")
          .set("Authorization", `Bearer ${staffLogin.body.accessToken}`)
      ).status
    ).toBe(403);
  });

  it("sanitizes sensitive activity metadata recursively", () => {
    const sanitized = sanitizeAuditValue({
      password: "plain",
      nested: {
        refreshToken: "raw-token",
        safe: "allowed"
      }
    });
    expect(sanitized).toEqual({
      password: "[REDACTED]",
      nested: { refreshToken: "[REDACTED]", safe: "allowed" }
    });
  });

  it("records success and denial events without request credentials", async () => {
    await createUser("audit@example.com", Role.SENDER);
    const success = await login("audit@example.com");
    expect(success.status).toBe(200);
    await login("audit@example.com", "WrongPassword123");
    const events = await database.activityEvent.findMany({
      where: { actionType: "AUTH_LOGIN" },
      orderBy: { createdAt: "asc" }
    });
    expect(events.map((event) => event.outcome)).toContain(ActivityOutcome.SUCCESS);
    expect(events.map((event) => event.outcome)).toContain(ActivityOutcome.FAILURE);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("WrongPassword123");
    expect(serialized).not.toContain(success.body.refreshToken);
  });
});
