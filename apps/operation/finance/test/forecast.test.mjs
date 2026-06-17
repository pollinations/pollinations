import assert from "node:assert/strict";
import test from "node:test";
import { forecast, nextMonth } from "../lib/forecast.mjs";

const base = {
    months: ["2025-01", "2025-02", "2025-03"],
    vendors: {
        Acme: "Compute",
        Beta: "Office",
        Gamma: "Revenue",
        Delta: "Compute",
    },
    data: {
        "2025-01": { Acme: -100, Beta: -42, Gamma: 500, Delta: 0 },
        "2025-02": { Acme: -200, Beta: -42, Gamma: 0, Delta: -50 },
        "2025-03": { Acme: -300, Beta: -42, Gamma: 700, Delta: -50 },
    },
};

const vendorRules = {
    "Acme Cloud Inc.": {
        canonical: "Acme",
        category: "Compute",
        forecast: "avg3",
    },
    "Beta, LLC": { canonical: "Beta", category: "Office", forecast: 42 },
    "Gamma Revenue": {
        canonical: "Gamma",
        category: "Revenue",
        forecast: "none",
    },
    "Delta Vendor": {
        canonical: "Delta",
        category: "Compute",
        forecast: "last",
    },
};

test("nextMonth increments correctly across year boundary", () => {
    assert.equal(nextMonth("2025-01"), "2025-02");
    assert.equal(nextMonth("2025-12"), "2026-01");
});

test("forecast adds N future months to the matrix", () => {
    const extended = forecast(base, vendorRules, 2);
    assert.deepEqual(extended.months, [
        "2025-01",
        "2025-02",
        "2025-03",
        "2025-04",
        "2025-05",
    ]);
});

test("forecast with fixed number copies that number forward", () => {
    const extended = forecast(base, vendorRules, 2);
    assert.equal(extended.data["2025-04"].Beta, 42);
    assert.equal(extended.data["2025-05"].Beta, 42);
});

test("forecast avg3 averages last three months", () => {
    const extended = forecast(base, vendorRules, 2);
    // Acme: (-100 + -200 + -300) / 3 = -200
    assert.equal(extended.data["2025-04"].Acme, -200);
    assert.equal(extended.data["2025-05"].Acme, -200);
});

test("forecast last uses last month's value", () => {
    const extended = forecast(base, vendorRules, 2);
    assert.equal(extended.data["2025-04"].Delta, -50);
});

test("forecast none leaves cell as zero", () => {
    const extended = forecast(base, vendorRules, 2);
    assert.equal(extended.data["2025-04"].Gamma, 0);
});

test("forecast live falls back to avg3 in v1", () => {
    const liveRules = {
        ...vendorRules,
        "Acme Cloud Inc.": {
            canonical: "Acme",
            category: "Compute",
            forecast: "live",
        },
    };
    const extended = forecast(base, liveRules, 1);
    assert.equal(extended.data["2025-04"].Acme, -200);
});

test("forecast marks future cells via a Set returned on the matrix", () => {
    const extended = forecast(base, vendorRules, 2);
    assert.ok(extended.forecastMonths instanceof Set);
    assert.ok(extended.forecastMonths.has("2025-04"));
    assert.ok(extended.forecastMonths.has("2025-05"));
    assert.ok(!extended.forecastMonths.has("2025-03"));
});

test("forecast marks live cells on the matrix for layout styling", () => {
    const liveRules = {
        ...vendorRules,
        "Acme Cloud Inc.": {
            canonical: "Acme",
            category: "Compute",
            forecast: "live",
        },
    };
    const extended = forecast(base, liveRules, 1);
    assert.ok(extended.liveCells instanceof Set);
    assert.ok(extended.liveCells.has("2025-04|Acme"));
});
