import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ACCOUNTS,
    enterIdentityEvent,
    mergeTransactions,
    normalize,
    totals,
} from "./stripe-sync.mjs";

const start = Date.UTC(2026, 8, 1) / 1000;
const end = Date.UTC(2026, 9, 1) / 1000;
const transaction = (id, category, amount, fee = 0) => ({
    id: `txn_${id}`,
    source: `ch_${id}`,
    created: start + 1,
    available_on: start + 86400,
    currency: "usd",
    reporting_category: category,
    amount,
    fee,
    net: amount - fee,
});
const exported = (rows, stream = "pollen") => ({
    account_id: ACCOUNTS[stream].id,
    start,
    end,
    rows,
});

test("financial categories conserve sales, fees and reversals without counting cash transfers", () => {
    const rows = normalize(
        exported([
            transaction("sale", "charge", 10000, 300),
            transaction("refund", "refund", -2000),
            transaction("failedRefund", "refund_failure", 500),
            transaction("dispute", "dispute", -1000, 2000),
            transaction("wonDispute", "dispute_reversal", 1000, -2000),
            transaction("standalone", "fee", -100),
            transaction("feeCredit", "fee", 25),
            transaction("payout", "payout", -7000),
            transaction("exchange", "currency_conversion", -1000, 10),
            transaction("hold", "payout_minimum_balance_hold", -100),
        ]),
        "pollen",
    );
    assert.deepEqual(totals(rows), [
        {
            key: "2026-09:pollen:USD",
            gross_sales: 10000,
            refunds: 1500,
            reversals: 0,
            stripe_fees: 385,
            payments: 1,
            refund_count: 1,
            net_after_fees: 8115,
        },
    ]);
});

test("refresh is idempotent and account-scoped, preserving untouched history", () => {
    const one = exported([transaction("same", "charge", 1000)]);
    const other = exported([transaction("same", "charge", 500)], "kofi");
    const first = mergeTransactions(
        [],
        [
            { exported: one, stream: "pollen" },
            { exported: other, stream: "kofi" },
        ],
    );
    assert.equal(first.length, 2);
    assert.deepEqual(
        mergeTransactions(first, [{ exported: one, stream: "pollen" }]),
        first,
    );
    const refreshed = mergeTransactions(first, [
        {
            exported: exported([transaction("same", "charge", 1000, 30)]),
            stream: "pollen",
        },
    ]);
    assert.equal(refreshed.length, 2);
    assert.equal(
        refreshed.find((r) => r.revenue_stream === "kofi").amount,
        500,
    );
    assert.equal(refreshed.find((r) => r.revenue_stream === "pollen").fee, 30);
});

test("rejects duplicate, out-of-range, inconsistent, unreviewed and wrong-account inputs", () => {
    const row = transaction("a", "charge", 123);
    for (const rows of [
        [row, row],
        [{ ...row, created: end }],
        [{ ...row, net: 124 }],
        [{ ...row, reporting_category: "unknown" }],
        [{ ...row, currency: "jpy" }],
    ])
        assert.throws(() => normalize(exported(rows), "pollen"));
    assert.throws(() => normalize(exported([row], "kofi"), "pollen"));
});

test("separates settlement currencies and calendar months", () => {
    const rows = normalize(
        exported([
            transaction("a", "charge", 100),
            { ...transaction("b", "refund", -23), currency: "eur" },
        ]),
        "pollen",
    );
    assert.equal(totals(rows).length, 2);
    assert.equal(
        totals(rows).find((r) => r.key.endsWith("EUR")).net_after_fees,
        -23,
    );
});

test("refresh preserves reviewed transaction classifications without duplicating money", () => {
    const source = exported([
        transaction("refund", "refund", -125),
        transaction("sale", "charge", 1000),
    ]);
    const before = normalize(source, "pollen");
    before[0].classification = "prior_period_fraud";
    before[0].evidence = ["https://drive.google.com/file/d/review/view"];
    const refreshed = mergeTransactions(before, [
        { exported: source, stream: "pollen" },
    ]);
    assert.equal(refreshed.length, 2);
    assert.equal(
        refreshed.find((r) => r.transaction_id === "txn_refund").classification,
        "prior_period_fraud",
    );
    assert.deepEqual(totals(refreshed), totals(before));
    assert.deepEqual(
        mergeTransactions(refreshed, [{ exported: source, stream: "pollen" }]),
        refreshed,
    );
});

test("Enter staging mirror retains charge identity without customer payloads", () => {
    for (const event_type of ["charge.succeeded", "payment_intent.succeeded"]) {
        const row = enterIdentityEvent({
            event_id: "evt_test",
            event_type,
            timestamp: "2026-09-01 00:00:00",
            charge_id: "ch_test",
            customer_email: "private@example.invalid",
            payload: "private source payload",
        });
        assert.deepEqual(Object.keys(row).sort(), [
            "event_id",
            "event_type",
            "livemode",
            "payload",
            "timestamp",
        ]);
        assert.ok(!JSON.stringify(row).includes("private"));
        const object = JSON.parse(row.payload).data.object;
        assert.equal(
            object[event_type === "charge.succeeded" ? "id" : "latest_charge"],
            "ch_test",
        );
    }
});
