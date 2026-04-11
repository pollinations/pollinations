import assert from "node:assert/strict";
import test from "node:test";
import {
    CATEGORIES,
    categoryIndex,
    isRevenue,
    REVENUE_CATEGORIES,
} from "../lib/categories.mjs";

test("CATEGORIES is a non-empty array of strings", () => {
    assert.ok(Array.isArray(CATEGORIES));
    assert.ok(CATEGORIES.length > 0);
    for (const c of CATEGORIES) assert.equal(typeof c, "string");
});

test("CATEGORIES contains expected operational categories", () => {
    const required = [
        "Revenue",
        "Compute",
        "Employee Salaries",
        "Office",
        "Other",
    ];
    for (const r of required) assert.ok(CATEGORIES.includes(r), `missing ${r}`);
});

test("isRevenue detects revenue categories", () => {
    assert.equal(isRevenue("Revenue"), true);
    assert.equal(isRevenue("Compute"), false);
});

test("categoryIndex returns stable sort keys", () => {
    assert.equal(categoryIndex("Revenue"), 0);
    assert.ok(categoryIndex("Compute") < categoryIndex("Other"));
    assert.equal(categoryIndex("NonexistentCat"), CATEGORIES.length); // unknowns sort last
});
