import { z } from "zod";
import {
  Capability,
  FundingMethod,
  PayoutMethod,
  StaffOperationalStatus,
  UserStatus
} from "../generated/prisma/enums.js";
import { countryCodeSchema, currencyCodeSchema } from "../transfers/validation.js";

const confirmedChange = {
  confirmed: z.literal(true),
  reason: z.string().trim().min(3).max(1_000)
};

const nullableText = (maximum: number) =>
  z.union([z.string().trim().min(1).max(maximum), z.null()]);

export const adminListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict();

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.email().max(320),
  temporaryPassword: z.string().min(12).max(128),
  capabilities: z.array(z.enum(Capability)).min(1).max(20),
  ...confirmedChange
}).strict();

export const updateStaffSchema = z.object({
  status: z.enum(UserStatus).optional(),
  operationalStatus: z.enum(StaffOperationalStatus).optional(),
  ...confirmedChange
}).strict().refine((value) => value.status !== undefined || value.operationalStatus !== undefined, {
  message: "A staff status change is required"
});

export const grantCapabilitySchema = z.object({
  capability: z.enum(Capability),
  ...confirmedChange
}).strict();

export const revokeCapabilitySchema = z.object(confirmedChange).strict();

const transferLimitSchema = z.object({
  minimumAmountMinor: z.string().regex(/^[1-9]\d{0,18}$/).optional(),
  maximumAmountMinor: z.string().regex(/^[1-9]\d{0,18}$/).optional()
}).strict().superRefine((value, context) => {
  if (!value.minimumAmountMinor && !value.maximumAmountMinor) {
    context.addIssue({ code: "custom", message: "At least one transfer limit is required" });
  }
  if (value.minimumAmountMinor && value.maximumAmountMinor && BigInt(value.minimumAmountMinor) > BigInt(value.maximumAmountMinor)) {
    context.addIssue({ code: "custom", path: ["maximumAmountMinor"], message: "Maximum must not be below minimum" });
  }
});

export const activateConfigurationSchema = z.object({
  quoteSlaMinutes: z.number().int().min(1).max(1_440),
  quoteDefaultExpiryMinutes: z.number().int().min(5).max(1_440),
  supportedOriginCountries: z.array(countryCodeSchema).min(1).max(100),
  supportedDestinationCountries: z.array(countryCodeSchema).min(1).max(100),
  supportedCurrencies: z.array(currencyCodeSchema).min(1).max(100),
  sendCurrenciesByOrigin: z.record(countryCodeSchema, z.array(currencyCodeSchema).min(1).max(20)),
  receiveCurrenciesByDestination: z.record(countryCodeSchema, z.array(currencyCodeSchema).min(1).max(20)),
  payoutMethodsByDestination: z.record(countryCodeSchema, z.array(z.enum(PayoutMethod)).min(1).max(4)),
  evidenceMaxSizeBytes: z.number().int().min(1_024).max(25 * 1024 * 1024),
  evidenceAllowedContentTypes: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
  transferLimitsByCurrency: z.record(currencyCodeSchema, transferLimitSchema).optional(),
  broadcastMessage: nullableText(1_000).optional(),
  maintenanceMessage: nullableText(1_000).optional(),
  ...confirmedChange
}).strict();

const fundingTemplateFields = {
  name: z.string().trim().min(1).max(120),
  method: z.enum(FundingMethod),
  currency: currencyCodeSchema,
  payeeName: z.string().trim().min(1).max(160),
  provider: nullableText(160).optional(),
  accountReference: nullableText(500).optional(),
  instructions: z.string().trim().min(1).max(2_000),
  active: z.boolean().optional()
};

export const createFundingTemplateSchema = z.object({
  ...fundingTemplateFields,
  ...confirmedChange
}).strict();

export const updateFundingTemplateSchema = z.object({
  name: fundingTemplateFields.name.optional(),
  method: fundingTemplateFields.method.optional(),
  currency: fundingTemplateFields.currency.optional(),
  payeeName: fundingTemplateFields.payeeName.optional(),
  provider: fundingTemplateFields.provider,
  accountReference: fundingTemplateFields.accountReference,
  instructions: fundingTemplateFields.instructions.optional(),
  active: fundingTemplateFields.active,
  ...confirmedChange
}).strict().refine((value) => Object.keys(value).some((key) => !["confirmed", "reason"].includes(key)), {
  message: "A template change is required"
});
