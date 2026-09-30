import { describe, expect, it } from "vitest";
import type { BillingOverview } from "../frontend/src/backend-types.ts";
import { autoTopUpStatus } from "../frontend/src/components/pollen/auto-top-up-status.ts";
import {
    describePaymentMethod,
    formatAddress,
    formatTaxId,
    paymentMethodDetails,
} from "../frontend/src/components/pollen/payment-method-format.ts";

function billing(
    overrides: {
        autoTopUp?: Partial<BillingOverview["autoTopUp"]>;
        paymentMethods?: BillingOverview["paymentMethods"];
        billingDetailsComplete?: boolean;
    } = {},
): BillingOverview {
    return {
        autoTopUp: {
            enabled: false,
            packAmountUsd: 20,
            lastIssue: null,
            ...overrides.autoTopUp,
        },
        paymentMethods: overrides.paymentMethods ?? [
            {
                id: "pm_card",
                type: "card",
                brand: "visa",
                last4: "4242",
                expMonth: 12,
                expYear: 2030,
                wallet: null,
                email: null,
                isDefault: true,
            },
        ],
        billingDetails: null,
        billingDetailsComplete: overrides.billingDetailsComplete ?? true,
        publishableKey: "pk_test_wallet",
    };
}

describe("automatic top-up on the tab label", () => {
    it("shows the active pack when on and Off when off, with no note", () => {
        expect(
            autoTopUpStatus(billing({ autoTopUp: { enabled: true } })),
        ).toEqual({
            tab: { on: true, label: "20", warning: false },
            text: null,
            action: null,
        });
        for (const state of [
            billing(),
            billing({ paymentMethods: [] }),
            billing({ billingDetailsComplete: false }),
        ])
            expect(autoTopUpStatus(state)).toEqual({
                tab: { on: false, label: "Off", warning: false },
                text: null,
                action: null,
            });
    });

    it("flags the tab and says what to do when the bank asks or a card was declined", () => {
        const pending = autoTopUpStatus(
            billing({
                autoTopUp: {
                    enabled: true,
                    lastIssue: {
                        kind: "pending_payment",
                        invoiceUrl: "https://invoice.stripe.com/i/test",
                        occurredAt: "2026-09-29T22:30:00.000Z",
                    },
                },
            }),
        );
        expect(pending.tab).toEqual({
            on: true,
            label: "20",
            warning: true,
        });
        expect(pending.action).toEqual({
            kind: "link",
            label: "Complete payment",
            href: "https://invoice.stripe.com/i/test",
        });

        const declinedIssue = {
            kind: "failed" as const,
            occurredAt: "2026-09-29T12:00:00.000Z",
        };
        expect(
            autoTopUpStatus(
                billing({
                    autoTopUp: { enabled: false, lastIssue: declinedIssue },
                }),
            ),
        ).toEqual({
            tab: { on: false, label: "Off", warning: true },
            // The attempt doesn't record which card; the default may be new.
            text: "Card declined Sep 29",
            action: { kind: "portal", label: "Update card" },
        });

        // Turned back on after fixing the card: the old decline is history.
        expect(
            autoTopUpStatus(
                billing({
                    autoTopUp: { enabled: true, lastIssue: declinedIssue },
                }),
            ).tab.warning,
        ).toBe(false);
    });
});

describe("saved payment methods and billing details", () => {
    const base = {
        id: "pm_1",
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        wallet: null,
        email: null,
        isDefault: false,
    };

    it("names each method the way the buyer knows it", () => {
        const applePay = {
            ...base,
            type: "card",
            brand: "mastercard",
            last4: "4444",
            expMonth: 3,
            expYear: 2028,
            wallet: "apple_pay",
        };
        expect(describePaymentMethod(applePay)).toBe("Mastercard •••• 4444");
        expect(paymentMethodDetails(applePay)).toEqual([
            "exp 03/28",
            "Apple Pay",
        ]);
        const paypal = { ...base, type: "paypal", email: "anna@example.com" };
        expect(describePaymentMethod(paypal)).toBe("PayPal");
        expect(paymentMethodDetails(paypal)).toEqual(["anna@example.com"]);
        expect(
            describePaymentMethod({
                ...base,
                type: "sepa_debit",
                last4: "3000",
            }),
        ).toBe("SEPA Direct Debit •••• 3000");
        // A type Stripe adds later still shows up by name.
        expect(describePaymentMethod({ ...base, type: "crypto" })).toBe(
            "Crypto",
        );
    });

    it("prints the VAT check status and a one-line address", () => {
        expect(
            formatTaxId({
                type: "eu_vat",
                value: "EE102030405",
                verification: "verified",
            }),
        ).toBe("EE102030405 · verified");
        expect(
            formatTaxId({
                type: "eu_vat",
                value: "FR1",
                verification: "pending",
            }),
        ).toBe("FR1 · being checked");
        expect(
            formatAddress({
                name: null,
                company: null,
                taxIds: [],
                email: null,
                line1: "Tartu mnt 1",
                line2: null,
                city: "Tallinn",
                state: null,
                postalCode: "10115",
                country: "EE",
            }),
        ).toBe("Tartu mnt 1, 10115 Tallinn, Estonia");
    });
});
