import assert from "node:assert/strict";
import test from "node:test";
import { sumNetRevenueCents } from "../lib/providers/stripe.mjs";

test("sumNetRevenueCents sums net across charges and refunds", () => {
    const txns = [
        { type: "charge", net: 9700, currency: "eur" },
        { type: "charge", net: 4850, currency: "eur" },
        { type: "refund", net: -1000, currency: "eur" },
    ];
    assert.equal(sumNetRevenueCents(txns), 9700 + 4850 - 1000);
});

test("sumNetRevenueCents excludes payout-type transactions", () => {
    const txns = [
        { type: "charge", net: 1000, currency: "eur" },
        { type: "payout", net: -1000, currency: "eur" },
        { type: "payout_failure", net: 1000, currency: "eur" },
        { type: "payout_cancel", net: 500, currency: "eur" },
    ];
    assert.equal(sumNetRevenueCents(txns), 1000);
});

test("sumNetRevenueCents handles empty list", () => {
    assert.equal(sumNetRevenueCents([]), 0);
});

test("sumNetRevenueCents tolerates missing net field", () => {
    const txns = [
        { type: "charge", net: 500 },
        { type: "charge" }, // net undefined → treated as 0
    ];
    assert.equal(sumNetRevenueCents(txns), 500);
});
