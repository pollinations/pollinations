import assert from "node:assert/strict";
import test from "node:test";
import { buildLayout } from "../lib/layout.mjs";

const matrix = {
    months: ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"],
    vendors: { Acme: "Compute", Beta: "Office", Gamma: "Revenue" },
    data: {
        "2025-01": { Acme: -100, Beta: -42, Gamma: 500 },
        "2025-02": { Acme: -200, Beta: -42, Gamma: 0 },
        "2025-03": { Acme: -300, Beta: -42, Gamma: 700 },
        "2025-04": { Acme: -200, Beta: -42, Gamma: 400 },
        "2025-05": { Acme: -200, Beta: -42, Gamma: 400 },
    },
    forecastMonths: new Set(["2025-04", "2025-05"]),
    liveCells: new Set(),
};

const config = {
    cashBalance: 10000,
    cashBalanceAsOf: "2025-04-01",
};

// currentMonth is passed explicitly so tests aren't date-dependent
const options = { currentMonth: "2025-04" };

test("buildLayout returns cells, formats, columnWidths, freezeRows", () => {
    const out = buildLayout(matrix, config, options);
    assert.ok(Array.isArray(out.cells));
    assert.ok(Array.isArray(out.formats));
    assert.ok(Array.isArray(out.columnWidths));
    assert.equal(typeof out.freezeRows, "number");
});

test("buildLayout first row is the title", () => {
    const { cells } = buildLayout(matrix, config, options);
    assert.equal(cells[0][0], "POLLINATIONS FINANCE — RUNWAY TRACKER");
});

test("buildLayout includes a KPI summary row with cash, burn, runway", () => {
    const { cells } = buildLayout(matrix, config, options);
    const kpiRow = cells.find(
        (r) => typeof r[0] === "string" && r[0].startsWith("Cash:"),
    );
    assert.ok(kpiRow, "KPI row missing");
    assert.ok(kpiRow[0].includes("Cash: €10,000"));
    assert.ok(kpiRow[0].includes("Burn"));
    assert.ok(kpiRow[0].includes("Runway"));
});

test("buildLayout header row contains Category, Vendor, then each month", () => {
    const { cells } = buildLayout(matrix, config, options);
    const headerRow = cells.find(
        (r) => r[0] === "Category" && r[1] === "Vendor",
    );
    assert.ok(headerRow);
    assert.equal(headerRow[2], "Jan 2025");
    assert.equal(headerRow[3], "Feb 2025");
    assert.equal(headerRow[4], "Mar 2025");
    assert.equal(headerRow[5], "Apr 2025 (MTD)");
    assert.equal(headerRow[6], "May 2025 (fcst)");
});

test("buildLayout groups vendors under category headers with subtotals", () => {
    const { cells } = buildLayout(matrix, config, options);
    const categoryHeaders = cells.filter(
        (r) => r[0] === "Compute" && r[1] === "",
    );
    assert.ok(categoryHeaders.length >= 1);
    const subtotalRow = cells.find((r) => r[1] === "Compute subtotal");
    assert.ok(subtotalRow);
});

test("buildLayout computes monthly totals row", () => {
    const { cells } = buildLayout(matrix, config, options);
    const totalRow = cells.find((r) => r[1] === "TOTAL EXPENSES");
    assert.ok(totalRow);
    // Jan: Acme (-100) + Beta (-42) = -142
    assert.equal(totalRow[2], -142);
});

test("buildLayout computes net row (revenue + expenses)", () => {
    const { cells } = buildLayout(matrix, config, options);
    const netRow = cells.find(
        (r) => typeof r[1] === "string" && r[1].startsWith("NET"),
    );
    assert.ok(netRow);
    // Jan: 500 + (-142) = 358
    assert.equal(netRow[2], 358);
});

test("buildLayout computes running cash walking forward from cashBalanceAsOf", () => {
    const { cells } = buildLayout(matrix, config, options);
    const cashRow = cells.find((r) => r[1] === "Running cash");
    assert.ok(cashRow);
    // Starts at 10000 at April (cashBalanceAsOf = 2025-04-01)
    // April net: 400 + (-242) = 158 → 10158
    // May net: 400 + (-242) = 158 → 10316
    assert.equal(cashRow[5], 10000 + 158);
    assert.equal(cashRow[6], 10000 + 158 + 158);
});

test("buildLayout emits a format entry for the current month column", () => {
    const { formats } = buildLayout(matrix, config, options);
    const currentMonthFormat = formats.find(
        (f) => f.label === "currentMonthColumn",
    );
    assert.ok(currentMonthFormat, "missing currentMonthColumn format");
    // Apr is column index 5: A=Category, B=Vendor, C=Jan, D=Feb, E=Mar, F=Apr
    assert.ok(currentMonthFormat.range.includes("F"));
});

test("buildLayout emits format entries for forecast columns", () => {
    const { formats } = buildLayout(matrix, config, options);
    const forecastFormat = formats.find((f) => f.label === "forecastColumns");
    assert.ok(forecastFormat, "missing forecastColumns format");
});

test("buildLayout freezes the header row", () => {
    const { freezeRows } = buildLayout(matrix, config, options);
    assert.ok(freezeRows >= 1);
});
