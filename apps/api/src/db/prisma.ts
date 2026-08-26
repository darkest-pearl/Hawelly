import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function validateDatabaseUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim() || "";
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be an absolute PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  return value;
}

export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: validateDatabaseUrl(databaseUrl) });
  return new PrismaClient({ adapter });
}

export type HawellyPrismaClient = ReturnType<typeof createPrismaClient>;
