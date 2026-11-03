import assert from "node:assert/strict";
import test from "node:test";
import {
    CsvError,
    describe,
    inferType,
    parseCsv,
    queryRows,
    sniffDelimiter,
} from "./csv.js";

test("quoted cells keep delimiters and newlines", () => {
    const { rows } = parseCsv(
        'name,note\n"Ada","one, two"\n"Grace","line\nbreak"',
    );
    assert.deepEqual(rows, [
        ["name", "note"],
        ["Ada", "one, two"],
        ["Grace", "line\nbreak"],
    ]);
});

test("doubled quotes become one quote", () => {
    const { rows } = parseCsv('quote\n"she said ""hi"" today"');
    assert.equal(rows[1][0], 'she said "hi" today');
});

test("windows line endings and a trailing newline are handled", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    assert.deepEqual(rows, [
        ["a", "b"],
        ["1", "2"],
        ["3", "4"],
    ]);
});

test("semicolon and tab files are sniffed", () => {
    assert.equal(sniffDelimiter("a;b;c\n1;2;3\n4;5;6"), ";");
    assert.equal(sniffDelimiter("a\tb\tc\n1\t2\t3"), "\t");
    assert.equal(sniffDelimiter("a,b\n1,2"), ",");
    const { rows, delimiter } = parseCsv("x;y\n1;2");
    assert.equal(delimiter, ";");
    assert.deepEqual(rows, [
        ["x", "y"],
        ["1", "2"],
    ]);
});

test("an unterminated quote is reported instead of swallowed", () => {
    assert.throws(() => parseCsv('a\n"open'), CsvError);
});

test("an explicit delimiter that is not supported is rejected", () => {
    assert.throws(
        () => parseCsv("a|b", { delimiter: ":" }),
        /Unsupported delimiter/,
    );
});

test("types are inferred per column", () => {
    assert.equal(inferType(["1", "-2", "30"]), "integer");
    assert.equal(inferType(["1", "2.5", "-0.5"]), "number");
    assert.equal(inferType(["true", "no"]), "boolean");
    assert.equal(inferType(["2026-01-02", "2026-03-04T10:00"]), "date");
    assert.equal(inferType(["a", "1"]), "string");
    assert.equal(inferType(["", ""]), "empty");
    // A single empty cell must not turn a numeric column into a string column.
    assert.equal(inferType(["1", "", "3"]), "integer");
});

test("describe reports columns, empties and distinct values", () => {
    const { rows } = parseCsv("id,label\n1,a\n2,\n3,a");
    const summary = describe(rows);
    assert.deepEqual(summary.header, ["id", "label"]);
    assert.equal(summary.rowCount, 3);
    assert.equal(summary.columns[0].type, "integer");
    assert.equal(summary.columns[1].empty, 1);
    assert.equal(summary.columns[1].distinct, 2);
});

test("query filters, projects, sorts and pages", () => {
    const { rows } = parseCsv(
        "name,price,qty\nbolt,2,10\nnut,1.5,4\nwasher,0.25,100",
    );
    const result = queryRows(rows, {
        where: [{ column: "qty", op: "gte", value: "10" }],
        order_by: { column: "price", direction: "desc" },
        limit: 1,
    });
    assert.deepEqual(result.columns, ["name", "price", "qty"]);
    assert.deepEqual(result.rows, [{ name: "bolt", price: "2", qty: "10" }]);
    assert.equal(result.matched, 2);
    assert.equal(result.total, 3);
    assert.equal(result.returned, 1);
});

test("numeric sorting is numeric, not alphabetical", () => {
    const { rows } = parseCsv("v\n9\n10\n2");
    const sorted = queryRows(rows, {
        order_by: { column: "v", direction: "asc" },
    });
    assert.deepEqual(
        sorted.rows.map((row) => row.v),
        ["2", "9", "10"],
    );
});

test("unknown columns are named in the error", () => {
    const { rows } = parseCsv("a,b\n1,2");
    assert.throws(
        () =>
            queryRows(rows, { where: [{ column: "c", op: "eq", value: "1" }] }),
        /Unknown column "c". Columns: a, b/,
    );
});

test("unknown operators are rejected", () => {
    const { rows } = parseCsv("a\n1");
    assert.throws(
        () =>
            queryRows(rows, {
                where: [{ column: "a", op: "matches", value: "1" }],
            }),
        /Unknown operator/,
    );
});

test("page size is capped", () => {
    const { rows } = parseCsv(
        `v\n${Array.from({ length: 2000 }, (_, i) => i).join("\n")}`,
    );
    assert.equal(queryRows(rows, { limit: 5000 }).returned, 1000);
});

test("duplicate headers stay addressable", () => {
    const { rows } = parseCsv("a,a\n1,2");
    const result = queryRows(rows, { select: ["a_2"] });
    assert.deepEqual(result.rows, [{ a_2: "2" }]);
});

test("a text without rows is an error, not an empty table", () => {
    assert.throws(() => parseCsv(""), CsvError);
});
