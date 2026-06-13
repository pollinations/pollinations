import { describe, expect, test } from "vitest";
import { formatPaymentMethodLabel } from "../frontend/src/components/pollen/format-payment-method.ts";

describe("formatPaymentMethodLabel", () => {
    test("no default payment method -> None", () => {
        expect(formatPaymentMethodLabel(null)).toBe("None");
        expect(
            formatPaymentMethodLabel({
                hasDefault: false,
                type: null,
                brand: null,
                last4: null,
            }),
        ).toBe("None");
    });

    test("card -> card icon, capitalized brand, bullets + last4", () => {
        expect(
            formatPaymentMethodLabel({
                hasDefault: true,
                type: "card",
                brand: "visa",
                last4: "4242",
            }),
        ).toBe("💳 Visa •••• 4242");
    });

    test("sepa_debit -> bank icon, SEPA Direct Debit + IBAN last4", () => {
        expect(
            formatPaymentMethodLabel({
                hasDefault: true,
                type: "sepa_debit",
                brand: null,
                last4: "3000",
            }),
        ).toBe("🏦 SEPA Direct Debit •••• 3000");
    });

    test("other type -> generic bank account label", () => {
        expect(
            formatPaymentMethodLabel({
                hasDefault: true,
                type: "other",
                brand: null,
                last4: null,
            }),
        ).toBe("🏦 Bank account");
    });
});
