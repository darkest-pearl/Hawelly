import { describe, expect, it } from "vitest";
import {
  countryLabel,
  reconcileRecipientDestination,
  recipientDestinationOptions,
  type SenderTransferOptions
} from "./workflow";

describe("sender transfer options", () => {
  it("derives every configured recipient country and merges its payout methods", () => {
    const options: SenderTransferOptions = {
      configurationVersion: 3,
      quoteSlaMinutes: 30,
      corridors: [
        {
          originCountry: "AE",
          destinationCountry: "PH",
          sendCurrencies: ["AED"],
          receiveCurrencies: ["PHP"],
          payoutMethods: ["BANK_TRANSFER"]
        },
        {
          originCountry: "GB",
          destinationCountry: "PH",
          sendCurrencies: ["GBP"],
          receiveCurrencies: ["PHP"],
          payoutMethods: ["MOBILE_MONEY"]
        },
        {
          originCountry: "AE",
          destinationCountry: "IN",
          sendCurrencies: ["AED"],
          receiveCurrencies: ["INR"],
          payoutMethods: ["BANK_TRANSFER"]
        }
      ]
    };

    expect(recipientDestinationOptions(options)).toEqual([
      {
        country: "PH",
        receiveCurrencies: ["PHP"],
        payoutMethods: ["BANK_TRANSFER", "MOBILE_MONEY"]
      },
      { country: "IN", receiveCurrencies: ["INR"], payoutMethods: ["BANK_TRANSFER"] }
    ]);
    expect(countryLabel("PH")).toBe("Philippines");
    expect(countryLabel("IN")).toBe("India");
  });

  it("covers one country, no countries, selection changes, labels, and refresh", () => {
    const one = recipientDestinationOptions({
      configurationVersion: 1,
      quoteSlaMinutes: 30,
      corridors: [{
        originCountry: "AE",
        destinationCountry: "EG",
        sendCurrencies: ["AED"],
        receiveCurrencies: ["EGP"],
        payoutMethods: ["BANK_TRANSFER"]
      }]
    });
    expect(one).toEqual([{ country: "EG", receiveCurrencies: ["EGP"], payoutMethods: ["BANK_TRANSFER"] }]);
    expect(countryLabel("EG")).toBe("Egypt");
    expect(countryLabel("UG")).toBe("Uganda");
    expect(countryLabel("ET")).toBe("Ethiopia");
    expect(recipientDestinationOptions({ configurationVersion: null, quoteSlaMinutes: 45, corridors: [] })).toEqual([]);
    expect(reconcileRecipientDestination(one, "EG", "MOBILE_MONEY")).toEqual({ country: "EG", payoutMethod: "BANK_TRANSFER" });
    expect(reconcileRecipientDestination(one, "UG", "BANK_TRANSFER")).toEqual({ country: "", payoutMethod: null });

    const refreshed = [{ ...one[0]!, payoutMethods: ["MOBILE_MONEY" as const] }];
    expect(reconcileRecipientDestination(refreshed, "EG", "BANK_TRANSFER")).toEqual({ country: "EG", payoutMethod: "MOBILE_MONEY" });
  });
});
