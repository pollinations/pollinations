import type Stripe from "stripe";
import { describe, expect, test } from "vitest";
import {
    paymentMethodSummary,
    resolveAutoTopUpCurrency,
} from "../src/utils/stripe-billing.ts";

const pm = (type: string) => ({ type }) as unknown as Stripe.PaymentMethod;
const cust = (currency: string | null) =>
    ({ currency }) as unknown as Stripe.Customer;
const cardPm = (brand: string, last4: string) =>
    ({
        type: "card",
        card: { brand, last4 },
    }) as unknown as Stripe.PaymentMethod;
const sepaPm = (last4: string) =>
    ({
        type: "sepa_debit",
        sepa_debit: { last4 },
    }) as unknown as Stripe.PaymentMethod;

describe("resolveAutoTopUpCurrency", () => {
    test("sepa_debit mandate -> eur even if customer is usd-pinned", () => {
        expect(resolveAutoTopUpCurrency(pm("sepa_debit"), cust("usd"))).toBe(
            "eur",
        );
    });
    test("eur-pinned customer with card -> eur", () => {
        expect(resolveAutoTopUpCurrency(pm("card"), cust("eur"))).toBe("eur");
    });
    test("card + usd-pinned -> usd", () => {
        expect(resolveAutoTopUpCurrency(pm("card"), cust("usd"))).toBe("usd");
    });
    test("card + no pin -> usd (default)", () => {
        expect(resolveAutoTopUpCurrency(pm("card"), cust(null))).toBe("usd");
    });
});

describe("paymentMethodSummary", () => {
    test("no payment method -> hasDefault false, all null", () => {
        expect(paymentMethodSummary(null)).toEqual({
            hasDefault: false,
            type: null,
            brand: null,
            last4: null,
        });
    });
    test("card -> type card with brand + last4", () => {
        expect(paymentMethodSummary(cardPm("visa", "4242"))).toEqual({
            hasDefault: true,
            type: "card",
            brand: "visa",
            last4: "4242",
        });
    });
    test("sepa_debit -> type sepa_debit with IBAN last4, no brand", () => {
        expect(paymentMethodSummary(sepaPm("3000"))).toEqual({
            hasDefault: true,
            type: "sepa_debit",
            brand: null,
            last4: "3000",
        });
    });
    test("other PM type (e.g. paypal) -> type other, no brand/last4", () => {
        expect(paymentMethodSummary(pm("paypal"))).toEqual({
            hasDefault: true,
            type: "other",
            brand: null,
            last4: null,
        });
    });
});
