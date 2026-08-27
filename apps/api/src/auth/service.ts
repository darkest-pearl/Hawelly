import { randomUUID } from "node:crypto";
import {
  ActivityOutcome,
  Capability,
  Prisma,
  Role,
  SessionRevocationReason,
  StaffOperationalStatus,
  UserStatus
} from "../generated/prisma/client.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import type { RequestContext } from "../middleware/requestContext.js";
import { hashAuditIdentifier, writeActivity } from "./audit.js";
import type { AuthConfig } from "./config.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password.js";
import {
  buildLoginRateLimitKeys,
  buildRegistrationRateLimitKey,
  clearLoginIdentifierRateLimits,
  lockRateLimitKeys,
  readRateLimit,
  recordLoginFailure,
  recordRegistrationAttempt
} from "./rateLimit.js";
import {
  parseRefreshToken,
  prepareRefreshToken,
  signAccessToken,
  tokenHashesMatch,
  verifyAccessToken
} from "./tokens.js";

export type Clock = () => Date;

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  role: Role;
  status: UserStatus;
  capabilities: readonly Capability[];
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessExpiresInSeconds: number;
  refreshExpiresAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: Role;
    status: UserStatus;
  };
}

export class PublicAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

class RefreshReplayError extends Error {}

const INVALID_CREDENTIALS = new PublicAuthError(
  401,
  "INVALID_CREDENTIALS",
  "Invalid credentials"
);
const INVALID_SESSION = new PublicAuthError(
  401,
  "INVALID_SESSION",
  "Invalid or expired session"
);
const AUTH_REQUIRED = new PublicAuthError(
  401,
  "AUTH_REQUIRED",
  "Authentication required"
);

interface PreparedSession {
  sessionId: string;
  familyId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ipHash: string;
  userAgentHash: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1_000);
}

function earlierDate(left: Date, right: Date) {
  return left <= right ? left : right;
}

function publicUser(user: {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status
  };
}

function hasOperationalAccess(user: {
  role: Role;
  staffProfile?: { operationalStatus: StaffOperationalStatus } | null;
}) {
  return (
    user.role === Role.SENDER ||
    user.staffProfile?.operationalStatus === StaffOperationalStatus.ACTIVE
  );
}

export class AuthService {
  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly config: AuthConfig,
    private readonly clock: Clock = () => new Date()
  ) {}

  private prepareSession(
    context: RequestContext,
    now: Date,
    familyId: string = randomUUID(),
    absoluteExpiresAt = addSeconds(now, this.config.sessionAbsoluteTtlSeconds)
  ): PreparedSession {
    const refresh = prepareRefreshToken();
    return {
      sessionId: refresh.sessionId,
      familyId,
      token: refresh.token,
      tokenHash: refresh.tokenHash,
      expiresAt: earlierDate(
        addSeconds(now, this.config.refreshTtlSeconds),
        absoluteExpiresAt
      ),
      absoluteExpiresAt,
      ipHash: hashAuditIdentifier(context.ipAddress, this.config.rateLimitPepper),
      userAgentHash: hashAuditIdentifier(
        context.userAgent || "unknown",
        this.config.rateLimitPepper
      )
    };
  }

  private async buildSessionResult(
    user: {
      id: string;
      fullName: string;
      email: string;
      role: Role;
      status: UserStatus;
      sessionVersion: number;
    },
    prepared: PreparedSession,
    now: Date
  ): Promise<SessionResult> {
    return {
      accessToken: await signAccessToken(
        {
          userId: user.id,
          sessionId: prepared.sessionId,
          sessionVersion: user.sessionVersion
        },
        this.config,
        now
      ),
      refreshToken: prepared.token,
      tokenType: "Bearer",
      accessExpiresInSeconds: this.config.accessTtlSeconds,
      refreshExpiresAt: prepared.expiresAt.toISOString(),
      user: publicUser(user)
    };
  }

  async registerSender(
    input: { fullName: string; email: string; password: string },
    context: RequestContext
  ) {
    const now = this.clock();
    const email = normalizeEmail(input.email);
    const registrationKey = buildRegistrationRateLimitKey(
      context.ipAddress,
      this.config
    );
    const ipHash = hashAuditIdentifier(
      context.ipAddress,
      this.config.rateLimitPepper
    );
    const admission = await this.database.$transaction(async (transaction) => {
      await lockRateLimitKeys(transaction, [registrationKey]);
      const decision = await readRateLimit(transaction, [registrationKey], now);
      if (decision.blocked) return decision;
      await recordRegistrationAttempt(
        transaction,
        registrationKey,
        this.config,
        now
      );
      return decision;
    });
    if (admission.blocked) {
      await writeActivity(this.database, {
        source: context.source,
        requestId: context.requestId,
        actionType: "AUTH_REGISTER",
        outcome: ActivityOutcome.DENIED,
        errorCode: "RATE_LIMITED",
        ipHash,
        metadata: { retryAfterSeconds: admission.retryAfterSeconds }
      });
      throw new PublicAuthError(
        429,
        "RATE_LIMITED",
        "Too many registration attempts. Try again later.",
        admission.retryAfterSeconds
      );
    }

    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const prepared = this.prepareSession(context, now);

    try {
      const user = await this.database.$transaction(
        async (transaction) => {
          const created = await transaction.user.create({
            data: {
              id: userId,
              fullName: input.fullName.trim(),
              email,
              passwordHash,
              role: Role.SENDER,
              status: UserStatus.ACTIVE,
              passwordChangedAt: now
            }
          });
          await transaction.authSession.create({
            data: {
              id: prepared.sessionId,
              familyId: prepared.familyId,
              userId: created.id,
              tokenHash: prepared.tokenHash,
              clientSource: context.source,
              ipHash: prepared.ipHash,
              userAgentHash: prepared.userAgentHash,
              createdAt: now,
              lastUsedAt: now,
              expiresAt: prepared.expiresAt,
              absoluteExpiresAt: prepared.absoluteExpiresAt
            }
          });
          await writeActivity(transaction, {
            actorUserId: created.id,
            actorRole: created.role,
            source: context.source,
            requestId: context.requestId,
            actionType: "AUTH_REGISTER",
            outcome: ActivityOutcome.SUCCESS,
            entityType: "User",
            entityId: created.id,
            ipHash: prepared.ipHash,
            metadata: { role: Role.SENDER }
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return this.buildSessionResult(user, prepared, now);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        await writeActivity(this.database, {
          source: context.source,
          requestId: context.requestId,
          actionType: "AUTH_REGISTER",
          outcome: ActivityOutcome.FAILURE,
          errorCode: "ACCOUNT_NOT_CREATED",
          ipHash: prepared.ipHash,
          metadata: {}
        });
        throw new PublicAuthError(
          409,
          "ACCOUNT_NOT_CREATED",
          "Account could not be created"
        );
      }
      throw error;
    }
  }

  async login(
    input: { email: string; password: string },
    context: RequestContext
  ) {
    const now = this.clock();
    const email = normalizeEmail(input.email);
    const keys = buildLoginRateLimitKeys(
      context.rateLimitAddress || context.ipAddress,
      email,
      this.config
    );
    const ipHash = hashAuditIdentifier(context.ipAddress, this.config.rateLimitPepper);
    const keyValues = Object.values(keys);

    const result = await this.database.$transaction(async (transaction) => {
      await lockRateLimitKeys(transaction, keyValues);
      const decision = await readRateLimit(transaction, keyValues, now);
      if (decision.blocked) {
        await writeActivity(transaction, {
          source: context.source,
          requestId: context.requestId,
          actionType: "AUTH_LOGIN",
          outcome: ActivityOutcome.DENIED,
          errorCode: "RATE_LIMITED",
          ipHash,
          metadata: { retryAfterSeconds: decision.retryAfterSeconds }
        });
        return { outcome: "blocked" as const, decision };
      }

      const user = await transaction.user.findUnique({
        where: { email },
        include: { staffProfile: { select: { operationalStatus: true } } }
      });
      const passwordMatches = user
        ? await verifyPassword(user.passwordHash, input.password)
        : await verifyDummyPassword(input.password);

      if (
        !user ||
        user.status !== UserStatus.ACTIVE ||
        !hasOperationalAccess(user) ||
        !passwordMatches
      ) {
        await recordLoginFailure(transaction, keys, this.config, now);
        await writeActivity(transaction, {
          actorUserId: user?.id ?? null,
          actorRole: user?.role ?? null,
          source: context.source,
          requestId: context.requestId,
          actionType: "AUTH_LOGIN",
          outcome: ActivityOutcome.FAILURE,
          entityType: user ? "User" : null,
          entityId: user?.id ?? null,
          errorCode: "INVALID_CREDENTIALS",
          ipHash,
          metadata: {}
        });
        return { outcome: "invalid" as const };
      }

      const prepared = this.prepareSession(context, now);
      await transaction.authSession.create({
        data: {
          id: prepared.sessionId,
          familyId: prepared.familyId,
          userId: user.id,
          tokenHash: prepared.tokenHash,
          clientSource: context.source,
          ipHash: prepared.ipHash,
          userAgentHash: prepared.userAgentHash,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: prepared.expiresAt,
          absoluteExpiresAt: prepared.absoluteExpiresAt
        }
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now }
      });
      await clearLoginIdentifierRateLimits(transaction, keys);
      await writeActivity(transaction, {
        actorUserId: user.id,
        actorRole: user.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "AUTH_LOGIN",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "AuthSession",
        entityId: prepared.sessionId,
        ipHash,
        metadata: {}
      });
      return { outcome: "success" as const, user, prepared };
    });

    if (result.outcome === "blocked") {
      throw new PublicAuthError(
        429,
        "RATE_LIMITED",
        "Too many failed login attempts. Try again later.",
        result.decision.retryAfterSeconds
      );
    }
    if (result.outcome === "invalid") throw INVALID_CREDENTIALS;
    return this.buildSessionResult(result.user, result.prepared, now);
  }

  private async revokeFamilyForReplay(
    session: { userId: string; familyId: string; id: string; user: { role: Role } },
    context: RequestContext,
    now: Date
  ) {
    await this.database.$transaction(async (transaction) => {
      const claimed = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          revocationReason: SessionRevocationReason.ROTATED,
          replayDetectedAt: null
        },
        data: { replayDetectedAt: now }
      });
      if (claimed.count !== 1) return;
      await transaction.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: {
          revokedAt: now,
          revocationReason: SessionRevocationReason.REPLAY_DETECTED
        }
      });
      await transaction.user.update({
        where: { id: session.userId },
        data: { sessionVersion: { increment: 1 } }
      });
      await writeActivity(transaction, {
        actorUserId: session.userId,
        actorRole: session.user.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "AUTH_REFRESH_REPLAY",
        outcome: ActivityOutcome.DENIED,
        entityType: "AuthSession",
        entityId: session.id,
        errorCode: "REFRESH_REPLAY_DETECTED",
        ipHash: hashAuditIdentifier(context.ipAddress, this.config.rateLimitPepper),
        metadata: {}
      });
    });
  }

  async refresh(refreshToken: string, context: RequestContext) {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw INVALID_SESSION;
    const now = this.clock();
    const existing = await this.database.authSession.findUnique({
      where: { id: parsed.sessionId },
      include: {
        user: { include: { staffProfile: { select: { operationalStatus: true } } } }
      }
    });
    if (!existing || !tokenHashesMatch(existing.tokenHash, parsed.tokenHash)) {
      throw INVALID_SESSION;
    }
    if (
      existing.revokedAt ||
      existing.expiresAt <= now ||
      existing.absoluteExpiresAt <= now ||
      existing.user.status !== UserStatus.ACTIVE ||
      !hasOperationalAccess(existing.user)
    ) {
      if (existing.revocationReason === SessionRevocationReason.ROTATED) {
        await this.revokeFamilyForReplay(existing, context, now);
      }
      throw INVALID_SESSION;
    }

    const prepared = this.prepareSession(
      context,
      now,
      existing.familyId,
      existing.absoluteExpiresAt
    );

    try {
      await this.database.$transaction(
        async (transaction) => {
          const consumed = await transaction.authSession.updateMany({
            where: {
              id: existing.id,
              revokedAt: null,
              expiresAt: { gt: now },
              absoluteExpiresAt: { gt: now }
            },
            data: {
              revokedAt: now,
              revocationReason: SessionRevocationReason.ROTATED,
              lastUsedAt: now
            }
          });
          if (consumed.count !== 1) throw new RefreshReplayError();
          await transaction.authSession.create({
            data: {
              id: prepared.sessionId,
              familyId: prepared.familyId,
              userId: existing.userId,
              tokenHash: prepared.tokenHash,
              clientSource: context.source,
              ipHash: prepared.ipHash,
              userAgentHash: prepared.userAgentHash,
              createdAt: now,
              lastUsedAt: now,
              expiresAt: prepared.expiresAt,
              absoluteExpiresAt: prepared.absoluteExpiresAt
            }
          });
          await transaction.authSession.update({
            where: { id: existing.id },
            data: { replacedById: prepared.sessionId }
          });
          await writeActivity(transaction, {
            actorUserId: existing.userId,
            actorRole: existing.user.role,
            source: context.source,
            requestId: context.requestId,
            actionType: "AUTH_REFRESH",
            outcome: ActivityOutcome.SUCCESS,
            entityType: "AuthSession",
            entityId: prepared.sessionId,
            ipHash: prepared.ipHash,
            metadata: {}
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (error instanceof RefreshReplayError) {
        await this.revokeFamilyForReplay(existing, context, now);
        throw INVALID_SESSION;
      }
      throw error;
    }

    return this.buildSessionResult(existing.user, prepared, now);
  }

  async logout(refreshToken: string | undefined, context: RequestContext) {
    if (!refreshToken) return;
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) return;
    const existing = await this.database.authSession.findUnique({
      where: { id: parsed.sessionId },
      include: { user: { select: { role: true } } }
    });
    if (!existing || !tokenHashesMatch(existing.tokenHash, parsed.tokenHash)) return;
    if (existing.revokedAt) return;
    const now = this.clock();
    await this.database.$transaction(async (transaction) => {
      await transaction.authSession.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: {
          revokedAt: now,
          revocationReason: SessionRevocationReason.LOGOUT
        }
      });
      await writeActivity(transaction, {
        actorUserId: existing.userId,
        actorRole: existing.user.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "AUTH_LOGOUT",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "AuthSession",
        entityId: existing.id,
        ipHash: hashAuditIdentifier(context.ipAddress, this.config.rateLimitPepper),
        metadata: {}
      });
    });
  }

  async logoutAll(principal: AuthPrincipal, context: RequestContext) {
    const now = this.clock();
    await this.database.$transaction(
      async (transaction) => {
        await transaction.authSession.updateMany({
          where: { userId: principal.userId, revokedAt: null },
          data: {
            revokedAt: now,
            revocationReason: SessionRevocationReason.LOGOUT_ALL
          }
        });
        await transaction.user.update({
          where: { id: principal.userId },
          data: { sessionVersion: { increment: 1 } }
        });
        await writeActivity(transaction, {
          actorUserId: principal.userId,
          actorRole: principal.role,
          source: context.source,
          requestId: context.requestId,
          actionType: "AUTH_LOGOUT_ALL",
          outcome: ActivityOutcome.SUCCESS,
          entityType: "User",
          entityId: principal.userId,
          ipHash: hashAuditIdentifier(context.ipAddress, this.config.rateLimitPepper),
          metadata: {}
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async authenticate(accessToken: string): Promise<AuthPrincipal> {
    let claims;
    try {
      claims = await verifyAccessToken(accessToken, this.config);
    } catch {
      throw AUTH_REQUIRED;
    }
    const now = this.clock();
    const session = await this.database.authSession.findUnique({
      where: { id: claims.sessionId },
      include: {
        user: { include: { staffProfile: { select: { operationalStatus: true } } } }
      }
    });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      !hasOperationalAccess(session.user) ||
      session.user.sessionVersion !== claims.sessionVersion
    ) {
      throw AUTH_REQUIRED;
    }

    const capabilities =
      session.user.role === Role.ADMIN
        ? Object.values(Capability)
        : session.user.role === Role.STAFF
          ? (
              await this.database.staffCapabilityGrant.findMany({
                where: { staffUserId: session.userId, revokedAt: null },
                select: { capability: true }
              })
            ).map((grant) => grant.capability)
          : [];

    const staleBefore = new Date(now.getTime() - 5 * 60 * 1_000);
    if (session.lastUsedAt < staleBefore) {
      await this.database.authSession.updateMany({
        where: { id: session.id, revokedAt: null, lastUsedAt: { lt: staleBefore } },
        data: { lastUsedAt: now }
      });
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
      status: session.user.status,
      capabilities
    };
  }

  async me(principal: AuthPrincipal) {
    const user = await this.database.user.findUnique({
      where: { id: principal.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true
      }
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw AUTH_REQUIRED;
    return {
      ...publicUser(user),
      capabilities: principal.capabilities,
      session: { id: principal.sessionId }
    };
  }
}

export const authErrors = {
  authRequired: AUTH_REQUIRED,
  invalidSession: INVALID_SESSION
};
