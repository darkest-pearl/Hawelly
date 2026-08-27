import { describe, expect, it } from "vitest";
import { formatMinorAmount, majorToMinor, transferStatus } from "./workflow";

describe("sender workflow formatting", () => {
  it("converts decimal major units without floating point arithmetic", () => {
    expect(majorToMinor("1,250.50")).toBe("125050");
    expect(majorToMinor("10")).toBe("1000");
    expect(majorToMinor("0")).toBeNull();
    expect(majorToMinor("1.005")).toBeNull();
    expect(majorToMinor("1e3")).toBeNull();
  });

  it("formats arbitrarily large minor-unit strings exactly", () => {
    expect(formatMinorAmount("125050", "AED")).toBe("AED 1,250.50");
    expect(formatMinorAmount("900719925474099300", "AED")).toBe(
      "AED 9,007,199,254,740,993.00"
    );
  });

  it("uses concise sender-facing status labels", () => {
    expect(transferStatus("REQUESTED")).toEqual({
      label: "Quote requested",
      tone: "info"
    });
    expect(transferStatus("NEEDS_INFO").tone).toBe("warning");
  });
});

