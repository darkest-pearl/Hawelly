import { describe, expect, it } from "vitest";
import {
  authEntryPath,
  parsePortalRole,
  portalHome,
  safeAuthDestination
} from "./auth-destination";

describe("authentication destination policy", () => {
  it("preserves only known sender destinations", () => {
    expect(safeAuthDestination("/sender/new-transfer", "SENDER")).toBe(
      "/sender/new-transfer"
    );
    expect(
      safeAuthDestination(
        "/sender/transfers/00000000-0000-4000-8000-000000000001",
        "SENDER"
      )
    ).toContain("/sender/transfers/");
  });

  it.each([
    "https://attacker.invalid",
    "//attacker.invalid",
    "/sender?next=https://attacker.invalid",
    "/sender#fragment",
    "/sender\\new-transfer",
    "/admin",
    "/staff"
  ])("rejects unsafe or cross-portal sender destination %s", (destination) => {
    expect(safeAuthDestination(destination, "SENDER")).toBe("/sender");
  });

  it("keeps staff and admin entry restricted to their own portal roots", () => {
    expect(safeAuthDestination("/staff", "STAFF")).toBe("/staff");
    expect(safeAuthDestination("/sender", "STAFF")).toBe("/staff");
    expect(safeAuthDestination("/admin", "ADMIN")).toBe("/admin");
    expect(safeAuthDestination("/staff", "ADMIN")).toBe("/admin");
  });

  it("maps unknown portal requests to sender and creates local entry URLs", () => {
    expect(parsePortalRole("unknown")).toBe("SENDER");
    expect(parsePortalRole("staff")).toBe("STAFF");
    expect(portalHome("ADMIN")).toBe("/admin");
    expect(authEntryPath("SENDER", "/sender/new-transfer")).toBe(
      "/sign-in?next=%2Fsender%2Fnew-transfer"
    );
  });
});
