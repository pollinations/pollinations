import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCsv } from "../lib/parse-csv.mjs";

const fixturePath = new URL("./fixtures/mini.csv", import.meta.url);

test("parseCsv returns array of row objects with expected keys", async () => {
    const text = await readFile(fixturePath, "utf8");
    const rows = parseCsv(text);
    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
        "amount_eur",
        "bank_account",
        "category",
        "counterparty",
        "date",
        "status",
    ]);
});

test("parseCsv converts amount_eur to number", async () => {
    const text = await readFile(fixturePath, "utf8");
    const rows = parseCsv(text);
    assert.equal(rows[0].amount_eur, -100.5);
    assert.equal(rows[2].amount_eur, 500);
});

test("parseCsv handles quoted fields with commas", async () => {
    const text = await readFile(fixturePath, "utf8");
    const rows = parseCsv(text);
    assert.equal(rows[1].counterparty, "Beta, LLC");
});

test("parseCsv handles empty status field", async () => {
    const text = await readFile(fixturePath, "utf8");
    const rows = parseCsv(text);
    assert.equal(rows[1].status, "");
});

test("parseCsv throws with filename and line number on malformed row", () => {
    const bad = "counterparty,date,amount_eur\nAcme,2025-01-15\n"; // only 2 columns
    assert.throws(
        () => parseCsv(bad, { filename: "bad.csv" }),
        /bad\.csv.*line 2/,
    );
});
