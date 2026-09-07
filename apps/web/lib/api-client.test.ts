import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ClientApiError, errorFields } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

describe("client API validation errors", () => {
  it("retains only safe string field messages from the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields",
        fields: { phone: "Use international format.", ignored: { secret: true } }
      }
    }), { status: 400, headers: { "Content-Type": "application/json" } })));

    const error = await apiFetch("/recipients", { method: "POST", body: "{}" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ClientApiError);
    expect(errorFields(error)).toEqual({ phone: "Use international format." });
  });
});
