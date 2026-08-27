import { describe, expect, it } from "vitest";
import { TransferStatus } from "../generated/prisma/enums.js";
import { assertTransferTransition, transferTransitions } from "./state.js";

describe("transfer state policy", () => {
  it("accepts every centrally declared transition", () => {
    for (const [from, targets] of Object.entries(transferTransitions)) {
      for (const target of targets) {
        expect(() =>
          assertTransferTransition(from as TransferStatus, target)
        ).not.toThrow();
      }
    }
  });

  it("rejects every undeclared edge, including request-to-hold", () => {
    for (const from of Object.values(TransferStatus)) {
      for (const target of Object.values(TransferStatus)) {
        if (transferTransitions[from].includes(target)) continue;
        expect(() => assertTransferTransition(from, target)).toThrowError(
          expect.objectContaining({ code: "INVALID_TRANSFER_TRANSITION" })
        );
      }
    }
    expect(() =>
      assertTransferTransition(TransferStatus.REQUESTED, TransferStatus.ON_HOLD)
    ).toThrow();
  });

  it.each([
    TransferStatus.QUOTE_EXPIRED,
    TransferStatus.CANCELLED,
    TransferStatus.DECLINED,
    TransferStatus.COMPLETED,
    TransferStatus.REFUNDED,
    TransferStatus.FAILED
  ])("keeps terminal state %s terminal", (status) => {
    expect(transferTransitions[status]).toEqual([]);
  });
});

