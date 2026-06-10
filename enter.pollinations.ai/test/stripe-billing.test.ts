import type Stripe from "stripe";
import { describe, expect, test } from "vitest";
import { resolveAutoTopUpCurrency } from "../src/utils/stripe-billing.ts";

const pm = (type: string) => ({ type }) as unknown as Stripe.PaymentMethod;
const cust = (currency: string | null) =>
    ({ currency }) as unknown as Stripe.Customer;

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
