import { describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./database.js";

describe("test database containment", () => {
  it("accepts an explicit loopback test database", () => {
    const value = "postgresql://postgres@127.0.0.1:55432/hawelly_test?schema=public";
    expect(resolveTestDatabaseUrl(value)).toBe(value);
  });

  it.each([
    "postgresql://postgres@127.0.0.1:5432/hawelly",
    "postgresql://postgres@db.example.com:5432/hawelly_test",
    "mysql://root@127.0.0.1/hawelly_test"
  ])("rejects unsafe destructive-test target %s", (value) => {
    expect(() => resolveTestDatabaseUrl(value)).toThrow(/TEST_DATABASE_URL/);
  });
});
