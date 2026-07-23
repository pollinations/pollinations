import { describe, expect, it } from "vitest";
import { paymentRequiredReason } from "./payment-required.js";
import { PollinationsError } from "./types.js";

describe("paymentRequiredReason", () => {
    it.each([
        "key_budget",
        "account_balance",
    ] as const)("recognizes %s", (reason) => {
        const error = new PollinationsError(
            "Payment required",
            "PAYMENT_REQUIRED",
            402,
            { name: "PaymentRequiredError", reason },
        );
        expect(paymentRequiredReason(error)).toBe(reason);
    });

    it("ignores unrelated and malformed errors", () => {
        expect(paymentRequiredReason(new Error("no"))).toBeNull();
        expect(
            paymentRequiredReason(
                new PollinationsError("no", "PAYMENT_REQUIRED", 402, {
                    reason: "unknown",
                }),
            ),
        ).toBeNull();
    });
});
