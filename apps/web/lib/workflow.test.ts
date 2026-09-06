import { describe, expect, it } from "vitest";
import {
  countryLabel,
  recipientDestinationOptions,
  type SenderTransferOptions
} from "./workflow";

describe("sender transfer options", () => {
  it("derives every configured recipient country and merges its payout methods", () => {
    const options: SenderTransferOptions = {
      quoteSlaMinutes: 30,
      corridors: [
        {
          originCountry: "AE",
          destinationCountry: "PH",
          sendCurrencies: ["AED"],
          payoutMethods: ["BANK_TRANSFER"]
        },
        {
          originCountry: "GB",
          destinationCountry: "PH",
          sendCurrencies: ["GBP"],
          payoutMethods: ["MOBILE_MONEY"]
        },
        {
          originCountry: "AE",
          destinationCountry: "IN",
          sendCurrencies: ["AED"],
          payoutMethods: ["BANK_TRANSFER"]
        }
      ]
    };

    expect(recipientDestinationOptions(options)).toEqual([
      {
        country: "PH",
        payoutMethods: ["BANK_TRANSFER", "MOBILE_MONEY"]
      },
      { country: "IN", payoutMethods: ["BANK_TRANSFER"] }
    ]);
    expect(countryLabel("PH")).toBe("Philippines");
    expect(countryLabel("IN")).toBe("India");
  });
});
