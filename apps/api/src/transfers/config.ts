import { PayoutMethod } from "../generated/prisma/enums.js";
import { z } from "zod";

const countryCodeSchema = z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase());
const currencyCodeSchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());

const corridorSchema = z
  .object({
    originCountry: countryCodeSchema,
    destinationCountry: countryCodeSchema,
    sendCurrencies: z.array(currencyCodeSchema).min(1).max(20),
    payoutMethods: z.array(z.enum(PayoutMethod)).min(1).max(10)
  })
  .strict();

const corridorListSchema = z.array(corridorSchema).min(1).max(100);

export interface TransferCorridor {
  originCountry: string;
  destinationCountry: string;
  sendCurrencies: readonly string[];
  payoutMethods: readonly PayoutMethod[];
}

export interface TransferWorkflowConfig {
  quoteSlaMinutes: number;
  corridors: readonly TransferCorridor[];
  maximumRecipientsPerSender: number;
  recipientCreateWindowSeconds: number;
  recipientCreateMaximum: number;
  maximumActiveTransfersPerSender: number;
  transferCreateWindowSeconds: number;
  transferCreateMaximum: number;
}

const DEFAULT_CORRIDORS: readonly TransferCorridor[] = [
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
];

function parseQuoteSlaMinutes(value: string | undefined) {
  if (!value?.trim()) return 45;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("QUOTE_SLA_MINUTES must be an integer between 1 and 1440");
  }
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1_440) {
    throw new Error("QUOTE_SLA_MINUTES must be an integer between 1 and 1440");
  }
  return minutes;
}

function boundedInteger(name: string, value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (!value?.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseCorridors(value: string | undefined): readonly TransferCorridor[] {
  if (!value?.trim()) return DEFAULT_CORRIDORS;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error("TRANSFER_CORRIDORS_JSON must be valid JSON");
  }
  const parsed = corridorListSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("TRANSFER_CORRIDORS_JSON must contain valid corridor definitions");
  }
  const keys = new Set<string>();
  for (const corridor of parsed.data) {
    const key = `${corridor.originCountry}:${corridor.destinationCountry}`;
    if (keys.has(key)) {
      throw new Error("TRANSFER_CORRIDORS_JSON contains a duplicate corridor");
    }
    keys.add(key);
  }
  return parsed.data.map((corridor) => ({
    ...corridor,
    sendCurrencies: [...new Set(corridor.sendCurrencies)],
    payoutMethods: [...new Set(corridor.payoutMethods)]
  }));
}

export function resolveTransferWorkflowConfig(
  environment: NodeJS.ProcessEnv = process.env
): TransferWorkflowConfig {
  return {
    quoteSlaMinutes: parseQuoteSlaMinutes(environment.QUOTE_SLA_MINUTES),
    corridors: parseCorridors(environment.TRANSFER_CORRIDORS_JSON),
    maximumRecipientsPerSender: boundedInteger("SENDER_RECIPIENT_LIMIT", environment.SENDER_RECIPIENT_LIMIT, 100, 1, 10_000),
    recipientCreateWindowSeconds: boundedInteger("SENDER_RECIPIENT_CREATE_WINDOW_SECONDS", environment.SENDER_RECIPIENT_CREATE_WINDOW_SECONDS, 3_600, 60, 86_400),
    recipientCreateMaximum: boundedInteger("SENDER_RECIPIENT_CREATE_MAX", environment.SENDER_RECIPIENT_CREATE_MAX, 20, 1, 1_000),
    maximumActiveTransfersPerSender: boundedInteger("SENDER_ACTIVE_TRANSFER_LIMIT", environment.SENDER_ACTIVE_TRANSFER_LIMIT, 20, 1, 1_000),
    transferCreateWindowSeconds: boundedInteger("SENDER_TRANSFER_CREATE_WINDOW_SECONDS", environment.SENDER_TRANSFER_CREATE_WINDOW_SECONDS, 3_600, 60, 86_400),
    transferCreateMaximum: boundedInteger("SENDER_TRANSFER_CREATE_MAX", environment.SENDER_TRANSFER_CREATE_MAX, 10, 1, 1_000)
  };
}
