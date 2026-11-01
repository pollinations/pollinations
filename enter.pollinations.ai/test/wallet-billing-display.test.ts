import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BillingOverview } from "../frontend/src/backend-types.ts";
import { autoTopUpStatus } from "../frontend/src/components/pollen/auto-top-up-status.ts";
import {
    describePaymentMethod,
    formatAddress,
    formatTaxId,
    paymentMethodDetails,
} from "../frontend/src/components/pollen/payment-method-format.ts";
import { paymentMethods } from "../frontend/src/components/pollen/payment-trust-badge.tsx";
import {
    PollenBalance,
    SidebarBalance,
} from "../frontend/src/components/pollen/pollen-balance.tsx";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});
afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

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
        lastPackPollen: null,
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
            // No card yet: the switch opens adding one first.
            billing({ paymentMethods: [], billingDetailsComplete: false }),
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
            label: "Approve",
            href: "https://invoice.stripe.com/i/test",
        });
        expect(pending.detail).toBeUndefined();

        // A card but no details: point to where they are on Stripe.
        const noDetails = autoTopUpStatus(
            billing({ billingDetailsComplete: false }),
        );
        expect(noDetails.action).toEqual({
            kind: "portal",
            label: "Add details",
        });
        expect(noDetails.detail).toMatch(/Profile settings/);

        // Turned off while the bank waits: no new purchases, but this one
        // is still payable, so Approve stays and says why.
        const pendingOff = autoTopUpStatus(
            billing({
                autoTopUp: {
                    enabled: false,
                    lastIssue: {
                        kind: "pending_payment",
                        invoiceUrl: "https://invoice.stripe.com/i/test",
                        occurredAt: "2026-09-29T22:30:00.000Z",
                    },
                },
            }),
        );
        expect(pendingOff.action).toEqual(pending.action);
        expect(pendingOff.detail).toMatch(/won’t buy again.*still needs/);

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
            text: "Card declined",
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

describe("payment logos before checkout", () => {
    it("puts the local method first and keeps general methods", () => {
        expect(paymentMethods("IN")[0]).toBe("upi");
        expect(paymentMethods("IN")).toContain("paypal");
        expect(paymentMethods("NL")).toEqual(
            expect.arrayContaining(["ideal-wero", "paypal"]),
        );
        expect(paymentMethods(null)).toContain("paypal");
    });

    it.each([undefined, null, "XX", "T1"])(
        "keeps the general list when the location is unknown (%s)",
        (country) =>
            expect(paymentMethods(country)).toEqual(paymentMethods(null)),
    );
});

describe("locked Quest pollen display", () => {
    it.each([true, false])(
        "shows spendable funds only when restricted=%s",
        (restricted) => {
            const router = createRouter({
                routeTree: createRootRoute(),
                history: createMemoryHistory(),
            });
            const html = renderToStaticMarkup(
                createElement(
                    RouterContextProvider,
                    { router },
                    createElement(PollenBalance, {
                        tierBalance: 35.54,
                        packBalance: 2,
                        tierWeek: 12.5,
                        questPollenRestricted: restricted,
                    }),
                ),
            );
            if (restricted) {
                expect(html).toContain("Available");
                expect(html).toContain("Quest pollen locked");
                expect(html).not.toContain("37.54");
                expect(html).not.toContain("/ 7d");
            } else {
                expect(html).toContain("Total");
                expect(html).not.toContain("Quest pollen locked");
                expect(html).toContain("37.54");
                expect(html).toContain("/ 7d");
            }
        },
    );

    it("keeps the balance visible with quiet purchase and support links", () => {
        const router = createRouter({
            routeTree: createRootRoute(),
            history: createMemoryHistory(),
        });
        const html = renderToStaticMarkup(
            createElement(
                RouterContextProvider,
                { router },
                createElement(PollenBalance, {
                    tierBalance: 35.54,
                    packBalance: 2,
                    questPollenRestricted: true,
                }),
            ),
        );
        expect(html).toContain("35.54");
        expect(html).toContain("Verification needed");
        expect(html).toContain("make your first purchase");
        expect(html).toContain('href="/pollen#buy-pollen"');
        expect(html).toContain('href="mailto:hello@pollinations.ai"');
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("request a review");

        const sidebar = renderToStaticMarkup(
            createElement(SidebarBalance, {
                kind: "tier",
                balance: 35.54,
                restricted: true,
            }),
        );
        expect(sidebar).toContain("35.54");
        expect(sidebar).not.toContain("Frozen");
        expect(sidebar).toContain(
            'aria-label="Quest pollen needs verification"',
        );
    });

    it("removes the restriction notice when the account is verified", () => {
        const html = renderToStaticMarkup(
            createElement(PollenBalance, {
                tierBalance: 35.54,
                packBalance: 2,
                questPollenRestricted: false,
                compact: true,
            }),
        );
        expect(html).toContain("35.54");
        expect(html).not.toContain("Verification needed");
        expect(html).not.toContain("couldn’t verify");
        const sidebar = renderToStaticMarkup(
            createElement(SidebarBalance, {
                kind: "tier",
                balance: 35.54,
                restricted: false,
            }),
        );
        expect(sidebar).not.toContain(
            'aria-label="Quest pollen needs verification"',
        );
    });
});

import {
    createMemoryHistory,
    createRootRoute,
    createRouter,
    RouterContextProvider,
} from "@tanstack/react-router";
