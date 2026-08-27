import { createHmac } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import {
  ActivitySource,
  type ActivityOutcome,
  type Role
} from "../generated/prisma/enums.js";
import type { HawellyPrismaClient } from "../db/prisma.js";

type AuditDatabase = HawellyPrismaClient | Prisma.TransactionClient;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /password|token|authorization|cookie|secret|otp|private.?key/i;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, nested]) => [
          key.slice(0, 120),
          SENSITIVE_KEY.test(key) ? REDACTED : sanitizeAuditValue(nested, depth + 1)
        ])
    );
  }
  return String(value).slice(0, 500);
}

export function hashAuditIdentifier(value: string, pepper: string) {
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}

export interface ActivityInput {
  actorUserId?: string | null;
  actorRole?: Role | null;
  source?: ActivitySource;
  requestId: string;
  actionType: string;
  outcome: ActivityOutcome;
  entityType?: string | null;
  entityId?: string | null;
  previousState?: Record<string, unknown> | null | undefined;
  nextState?: Record<string, unknown> | null | undefined;
  reason?: string | null | undefined;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
}

export function writeActivity(database: AuditDatabase, input: ActivityInput) {
  return database.activityEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      source: input.source ?? ActivitySource.API,
      requestId: input.requestId,
      actionType: input.actionType.slice(0, 120),
      outcome: input.outcome,
      entityType: input.entityType?.slice(0, 120) ?? null,
      entityId: input.entityId?.slice(0, 120) ?? null,
      ...(input.previousState
        ? {
            previousState: sanitizeAuditValue(
              input.previousState
            ) as Prisma.InputJsonObject
          }
        : {}),
      ...(input.nextState
        ? {
            nextState: sanitizeAuditValue(input.nextState) as Prisma.InputJsonObject
          }
        : {}),
      reason: input.reason?.slice(0, 1_000) ?? null,
      errorCode: input.errorCode?.slice(0, 120) ?? null,
      metadata: sanitizeAuditValue(input.metadata || {}) as Prisma.InputJsonObject,
      ipHash: input.ipHash ?? null
    }
  });
}
