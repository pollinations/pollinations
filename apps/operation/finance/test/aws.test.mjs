import assert from "node:assert/strict";
import test from "node:test";
import { computeAwsBalance } from "../lib/providers/aws.mjs";

const anchor = { as_of: "2026-05-01", balance_usd: 32114.88 };

const days = (entries) =>
    entries.map(([start, amount]) => ({
        TimePeriod: { Start: start },
        Total: { UnblendedCost: { Amount: String(amount) } },
    }));

test("AWS balance — sums daily UnblendedCost since anchor; all of MTD goes to credit while seed positive", () => {
    const r = computeAwsBalance({
        anchor,
        days: days([
            ["2026-05-01", 100],
            ["2026-05-02", 150],
            ["2026-05-03", 200],
        ]),
        currentMonth: "2026-05",
    });
    assert.equal(r.currentBalance, 31664.88); // 32114.88 - 450
    assert.equal(r.mtd_total_usd, 450);
    assert.equal(r.mtd_credit_usd, 450);
    assert.equal(r.mtd_cash_usd, 0);
    assert.equal(r.records, 3);
});

test("AWS balance — current month MTD excludes pre-month days that still count toward burn", () => {
    // Anchor was set in April; today is May 3. Apr days drain seed but don't
    // count toward May's MTD.
    const r = computeAwsBalance({
        anchor: { as_of: "2026-04-25", balance_usd: 32114.88 },
        days: days([
            ["2026-04-25", 100],
            ["2026-04-26", 100],
            ["2026-04-27", 100],
            ["2026-04-28", 100],
            ["2026-04-29", 100],
            ["2026-04-30", 100], // 600 in April
            ["2026-05-01", 50],
            ["2026-05-02", 50],
            ["2026-05-03", 50], // 150 in May (the MTD)
        ]),
        currentMonth: "2026-05",
    });
    assert.equal(r.currentBalance, 31364.88); // 32114.88 - 750
    assert.equal(r.mtd_total_usd, 150);
    assert.equal(r.mtd_credit_usd, 150);
    assert.equal(r.mtd_cash_usd, 0);
});

test("AWS balance — when seed exhausts, MTD shifts from credit to cash", () => {
    const r = computeAwsBalance({
        anchor: { as_of: "2026-05-01", balance_usd: 100 },
        days: days([
            ["2026-05-01", 100],
            ["2026-05-02", 50],
        ]),
        currentMonth: "2026-05",
    });
    // Burn 150 vs seed 100 → balance clamped to 0
    assert.equal(r.currentBalance, 0);
    assert.equal(r.mtd_total_usd, 150);
    // Balance is 0 → all MTD reported as cash.
    assert.equal(r.mtd_credit_usd, 0);
    assert.equal(r.mtd_cash_usd, 150);
});

test("AWS balance — empty days array (anchor == today) leaves balance untouched", () => {
    const r = computeAwsBalance({
        anchor,
        days: [],
        currentMonth: "2026-05",
    });
    assert.equal(r.currentBalance, 32114.88);
    assert.equal(r.mtd_total_usd, 0);
    assert.equal(r.mtd_credit_usd, 0);
    assert.equal(r.mtd_cash_usd, 0);
});
