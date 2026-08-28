import { describe, expect, it } from "vitest";
import {
  forbiddenPortalTerms,
  getPortalNavigation,
  validateOperationalReason
} from "./portal";
import { operationsTransfers, senderTransfers } from "./milestone-2-fixtures";

describe("portal navigation policy", () => {
  it("keeps sender, staff, and admin navigation separated", () => {
    expect(getPortalNavigation("sender").primary.map(({ label }) => label)).toEqual([
      "Transfers",
      "Recipients",
      "Support"
    ]);
    expect(getPortalNavigation("staff").administration).toEqual([]);
    expect(getPortalNavigation("admin").administration.map(({ label }) => label)).toEqual([
      "Users",
      "Configuration",
      "Funding templates",
      "Associates",
      "Activity"
    ]);
  });

  it("contains no prohibited donor architecture in any role navigation", () => {
    const labels = (["sender", "staff", "admin"] as const)
      .flatMap((role) => {
        const navigation = getPortalNavigation(role);
        return [...navigation.primary, ...navigation.administration];
      })
      .map(({ label }) => label.toLowerCase());

    for (const term of forbiddenPortalTerms) {
      expect(labels.some((label) => label.includes(term))).toBe(false);
    }
  });
});

describe("operational confirmation reason", () => {
  it("rejects empty and whitespace-only reasons", () => {
    expect(validateOperationalReason("")).toMatch(/reason/i);
    expect(validateOperationalReason("   ")).toMatch(/reason/i);
  });

  it("accepts a concise reason and rejects overlong input", () => {
    expect(validateOperationalReason("Sender requested a review")).toBeNull();
    expect(validateOperationalReason("x".repeat(241))).toMatch(/240/);
  });
});

describe("Milestone 2 display fixtures", () => {
  it("keep sender-facing records free of internal operational fields", () => {
    const internalOnlyFields = [
      "associate",
      "audit",
      "fundingInstructions",
      "internalNotes",
      "proofUrl"
    ];

    for (const transfer of senderTransfers) {
      expect(Object.keys(transfer)).not.toEqual(
        expect.arrayContaining(internalOnlyFields)
      );
    }
  });

  it("contains display-only fixtures without executable or remote values", () => {
    const serialized = JSON.stringify({ operationsTransfers, senderTransfers });
    expect(serialized).not.toMatch(/https?:|javascript:|<script/i);
  });
});
