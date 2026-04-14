import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalize } from "../lib/normalize.mjs";
import { parseCsv } from "../lib/parse-csv.mjs";

const csvPath = new URL("./fixtures/mini.csv", import.meta.url);
const vendorsPath = new URL("./fixtures/vendors.json", import.meta.url);

async function loadFixtures() {
    const text = await readFile(csvPath, "utf8");
    const vendors = JSON.parse(await readFile(vendorsPath, "utf8"));
    return { rows: parseCsv(text), vendors };
}

test("normalize maps raw vendor names to canonical", async () => {
    const { rows, vendors } = await loadFixtures();
    const { canonical, unknown } = normalize(rows, vendors);
    assert.equal(unknown.length, 0);
    assert.equal(canonical[0].vendor, "Acme");
    assert.equal(canonical[1].vendor, "Beta");
});

test("normalize overrides category from vendors.json", async () => {
    const { rows, vendors } = await loadFixtures();
    const { canonical } = normalize(rows, vendors);
    assert.equal(canonical[0].category, "Compute");
});

test("normalize extracts month from date", async () => {
    const { rows, vendors } = await loadFixtures();
    const { canonical } = normalize(rows, vendors);
    assert.equal(canonical[0].month, "2025-01");
});

test("normalize returns unknown vendors untouched and reports them", async () => {
    const rows = [
        {
            counterparty: "Zeta GmbH",
            date: "2025-02-01",
            bank_account: "x",
            category: "Other",
            amount_eur: -10,
            status: "",
        },
    ];
    const { canonical, unknown } = normalize(rows, {});
    assert.equal(canonical.length, 0);
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0], "Zeta GmbH");
});

test("normalize preserves negative/positive amounts as-is", async () => {
    const { rows, vendors } = await loadFixtures();
    const { canonical } = normalize(rows, vendors);
    assert.equal(canonical[0].amount, -100.5);
    assert.equal(canonical[2].amount, 500);
});
