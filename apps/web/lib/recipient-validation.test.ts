import { describe, expect, it } from "vitest";
import { validateRecipientDraft, type RecipientDraft } from "./recipient-validation";

const bankDraft: RecipientDraft = {
  fullName: "  Amina   M.   Hassan  ",
  phone: "",
  address: "",
  payoutMethod: "BANK_TRANSFER",
  accountName: "Amina M. Hassan",
  bankName: "Nile Bank",
  accountNumber: "123456",
  city: "",
  provider: "",
  instructions: ""
};

describe("recipient validation", () => {
  it("accepts inclusive names, collapses spaces, and keeps phone optional", () => {
    for (const fullName of ["أمل", "ሰላም", "Cher", "J.", "D'Arcy-Jones"]) {
      expect(validateRecipientDraft({ ...bankDraft, fullName }).errors).toEqual({});
    }
    expect(validateRecipientDraft(bankDraft).value).toMatchObject({
      fullName: "Amina M. Hassan",
      phone: null,
      address: null
    });
  });

  it("rejects controls and explains invalid supplied phone numbers", () => {
    expect(validateRecipientDraft({ ...bankDraft, fullName: "Amina\nHassan" }).errors.fullName).toMatch(/control/i);
    expect(validateRecipientDraft({ ...bankDraft, phone: "050 123 4567" }).errors.phone).toContain("+971501234567");
  });

  it("returns method-specific field errors without clearing the draft", () => {
    expect(validateRecipientDraft({ ...bankDraft, bankName: "", accountNumber: "" }).errors).toMatchObject({
      bankName: expect.any(String),
      accountNumber: expect.any(String)
    });
    expect(validateRecipientDraft({ ...bankDraft, payoutMethod: "MOBILE_MONEY", provider: "", accountNumber: "" }).errors).toMatchObject({
      provider: expect.any(String),
      accountNumber: expect.any(String)
    });
    expect(validateRecipientDraft({ ...bankDraft, payoutMethod: "CASH_PICKUP", city: "" }).errors.city).toBeTruthy();
    expect(validateRecipientDraft({ ...bankDraft, payoutMethod: "OTHER", instructions: "" }).errors.instructions).toBeTruthy();
  });
});
