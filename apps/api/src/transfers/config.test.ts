import { describe, expect, it } from "vitest";
import { PayoutMethod } from "../generated/prisma/enums.js";
import { resolveTransferWorkflowConfig } from "./config.js";

describe("transfer workflow configuration", () => {
  it("provides the explicit beta corridor and 45-minute quote SLA", () => {
    expect(resolveTransferWorkflowConfig({})).toEqual({
      quoteSlaMinutes: 45,
      maximumRecipientsPerSender: 100,
      recipientCreateWindowSeconds: 3_600,
      recipientCreateMaximum: 20,
      maximumActiveTransfersPerSender: 20,
      transferCreateWindowSeconds: 3_600,
      transferCreateMaximum: 10,
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
    });
  });

  it("normalizes and deduplicates a configured corridor", () => {
    const config = resolveTransferWorkflowConfig({
      QUOTE_SLA_MINUTES: "45",
      TRANSFER_CORRIDORS_JSON: JSON.stringify([
        {
          originCountry: "ae",
          destinationCountry: "ph",
          sendCurrencies: ["aed", "AED"],
          receiveCurrencies: ["php", "PHP"],
          payoutMethods: ["BANK_TRANSFER", "BANK_TRANSFER"]
        }
      ])
    });
    expect(config).toEqual({
      quoteSlaMinutes: 45,
      maximumRecipientsPerSender: 100,
      recipientCreateWindowSeconds: 3_600,
      recipientCreateMaximum: 20,
      maximumActiveTransfersPerSender: 20,
      transferCreateWindowSeconds: 3_600,
      transferCreateMaximum: 10,
      corridors: [
        {
          originCountry: "AE",
          destinationCountry: "PH",
          sendCurrencies: ["AED"],
          receiveCurrencies: ["PHP"],
          payoutMethods: [PayoutMethod.BANK_TRANSFER]
        }
      ]
    });
  });

  it.each(["0", "1441", "1.5", "invalid"])(
    "rejects invalid quote SLA %s",
    (value) => {
      expect(() =>
        resolveTransferWorkflowConfig({ QUOTE_SLA_MINUTES: value })
      ).toThrow("QUOTE_SLA_MINUTES");
    }
  );

  it("rejects malformed, empty, or duplicate corridor configuration", () => {
    expect(() =>
      resolveTransferWorkflowConfig({ TRANSFER_CORRIDORS_JSON: "{" })
    ).toThrow("valid JSON");
    expect(() =>
      resolveTransferWorkflowConfig({ TRANSFER_CORRIDORS_JSON: "[]" })
    ).toThrow("valid corridor definitions");
    expect(() =>
      resolveTransferWorkflowConfig({
        TRANSFER_CORRIDORS_JSON: JSON.stringify([
          {
            originCountry: "AE",
            destinationCountry: "PH",
            sendCurrencies: ["AED"],
            receiveCurrencies: ["PHP"],
            payoutMethods: ["BANK_TRANSFER"]
          },
          {
            originCountry: "ae",
            destinationCountry: "ph",
            sendCurrencies: ["USD"],
            receiveCurrencies: ["PHP"],
            payoutMethods: ["CASH_PICKUP"]
          }
        ])
      })
    ).toThrow("duplicate corridor");
  });

  it("validates sender write quotas", () => {
    expect(() => resolveTransferWorkflowConfig({ SENDER_RECIPIENT_LIMIT: "0" })).toThrow("SENDER_RECIPIENT_LIMIT");
    expect(() => resolveTransferWorkflowConfig({ SENDER_TRANSFER_CREATE_MAX: "unlimited" })).toThrow("SENDER_TRANSFER_CREATE_MAX");
  });
});
