import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicLinks } from "../lib/public-entry";

const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const supportSource = readFileSync(
  new URL("./support/page.tsx", import.meta.url),
  "utf8"
);

describe("public product entry", () => {
  it("connects every public navigation item and CTA to a real route", () => {
    expect(publicLinks).toEqual({
      brand: "/",
      transfers: "/sender",
      recipients: "/sender/recipients",
      support: "/support",
      staff: "/staff",
      admin: "/admin",
      signIn: "/sign-in?next=%2Fsender",
      createAccount: "/register?next=%2Fsender%2Fnew-transfer",
      requestTransfer: "/sign-in?next=%2Fsender%2Fnew-transfer"
    });
    expect(homeSource).toContain("next/link");
    for (const key of Object.keys(publicLinks)) {
      expect(homeSource).toContain(`publicLinks.${key}`);
    }
  });

  it("contains no placeholder auth/support anchors or anonymous transfer records", () => {
    expect(homeSource).not.toMatch(/href=["']#[^"']*/);
    expect(homeSource).not.toContain("Recent transfers");
    expect(homeSource).not.toContain("No transfers yet");
    expect(homeSource).toContain("A request is not a completed transfer");
  });

  it("provides useful support guidance without inventing a contact channel", () => {
    expect(supportSource).toContain("verified channel");
    expect(supportSource).toContain("never need your password");
    expect(supportSource).not.toMatch(/mailto:|tel:|whatsapp/i);
  });
});
