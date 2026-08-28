import type { AdminConfiguration, PayoutMethod, Prisma } from "../generated/prisma/client.js";
import type { HawellyPrismaClient } from "../db/prisma.js";

export interface TransferLimit {
  minimumAmountMinor?: string;
  maximumAmountMinor?: string;
}

export interface ActiveRuntimeConfiguration {
  version: number;
  quoteSlaMinutes: number;
  quoteDefaultExpiryMinutes: number;
  supportedOriginCountries: readonly string[];
  supportedDestinationCountries: readonly string[];
  supportedCurrencies: readonly string[];
  payoutMethodsByDestination: Readonly<Record<string, readonly PayoutMethod[]>>;
  evidenceMaxSizeBytes: number;
  evidenceAllowedContentTypes: readonly string[];
  transferLimitsByCurrency: Readonly<Record<string, TransferLimit>>;
}

export interface RuntimeConfigurationProvider {
  getActive(): Promise<ActiveRuntimeConfiguration | null>;
}

function objectValue(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function runtimeConfigurationProjection(
  configuration: AdminConfiguration
): ActiveRuntimeConfiguration {
  const payoutMethods = Object.fromEntries(
    Object.entries(objectValue(configuration.payoutMethodsByDestination)).map(
      ([country, methods]) => [country, Array.isArray(methods) ? methods as PayoutMethod[] : []]
    )
  );
  const transferLimits = Object.fromEntries(
    Object.entries(objectValue(configuration.transferLimitsByCurrency)).map(
      ([currency, limits]) => [currency, objectValue(limits as Prisma.JsonValue) as TransferLimit]
    )
  );
  return {
    version: configuration.version,
    quoteSlaMinutes: configuration.quoteSlaMinutes,
    quoteDefaultExpiryMinutes: configuration.quoteDefaultExpiryMinutes,
    supportedOriginCountries: configuration.supportedOriginCountries,
    supportedDestinationCountries: configuration.supportedDestinationCountries,
    supportedCurrencies: configuration.supportedCurrencies,
    payoutMethodsByDestination: payoutMethods,
    evidenceMaxSizeBytes: Number(configuration.evidenceMaxSizeBytes),
    evidenceAllowedContentTypes: configuration.evidenceAllowedContentTypes,
    transferLimitsByCurrency: transferLimits
  };
}

export class DatabaseRuntimeConfigurationProvider implements RuntimeConfigurationProvider {
  constructor(private readonly database: HawellyPrismaClient) {}

  async getActive() {
    const configuration = await this.database.adminConfiguration.findFirst({
      where: { active: true },
      orderBy: { version: "desc" }
    });
    return configuration ? runtimeConfigurationProjection(configuration) : null;
  }
}
