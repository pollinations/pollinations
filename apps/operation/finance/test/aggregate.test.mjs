import assert from "node:assert/strict";
import test from "node:test";
import { aggregate } from "../lib/aggregate.mjs";

const rows = [
    {
        date: "2025-01-15",
        month: "2025-01",
        vendor: "Acme",
        category: "Compute",
        amount: -100,
    },
    {
        date: "2025-01-28",
        month: "2025-01",
        vendor: "Acme",
        category: "Compute",
        amount: -50,
    },
    {
        date: "2025-02-01",
        month: "2025-02",
        vendor: "Acme",
        category: "Compute",
        amount: -200,
    },
    {
        date: "2025-01-20",
        month: "2025-01",
        vendor: "Beta",
        category: "Office",
        amount: -42,
    },
    {
        date: "2025-02-05",
        month: "2025-02",
        vendor: "Gamma",
        category: "Revenue",
        amount: 500,
    },
];

test("aggregate returns sorted month list", () => {
    const m = aggregate(rows);
    assert.deepEqual(m.months, ["2025-01", "2025-02"]);
});

test("aggregate collects unique vendors with their categories", () => {
    const m = aggregate(rows);
    assert.deepEqual(m.vendors, {
        Acme: "Compute",
        Beta: "Office",
        Gamma: "Revenue",
    });
});

test("aggregate sums amounts per vendor per month", () => {
    const m = aggregate(rows);
    assert.equal(m.data["2025-01"].Acme, -150);
    assert.equal(m.data["2025-02"].Acme, -200);
    assert.equal(m.data["2025-01"].Beta, -42);
    assert.equal(m.data["2025-02"].Gamma, 500);
});

test("aggregate returns zero for vendor/month combos with no transactions", () => {
    const m = aggregate(rows);
    assert.equal(m.data["2025-02"].Beta, 0);
    assert.equal(m.data["2025-01"].Gamma, 0);
});

test("aggregate handles empty input", () => {
    const m = aggregate([]);
    assert.deepEqual(m.months, []);
    assert.deepEqual(m.vendors, {});
    assert.deepEqual(m.data, {});
});
