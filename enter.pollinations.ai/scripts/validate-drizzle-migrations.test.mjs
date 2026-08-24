import assert from "node:assert/strict";
import test from "node:test";

import { findTemporaryTableCheckQualifiers } from "./validate-drizzle-migrations.mjs";

test("rejects Drizzle's invalid qualified CHECK during a SQLite rebuild", () => {
    const sql = `CREATE TABLE \`__new_example\` (
        \`kind\` text NOT NULL,
        CONSTRAINT "example_kind" CHECK("__new_example"."kind" IN ('proxy', 'agent'))
    );
    --> statement-breakpoint
    ALTER TABLE \`__new_example\` RENAME TO \`example\`;`;

    assert.deepEqual(findTemporaryTableCheckQualifiers(sql), [
        { line: 3, table: "__new_example" },
    ]);
});

test("accepts unqualified CHECK expressions in SQLite rebuilds", () => {
    const sql = `CREATE TABLE \`__new_example\` (
        \`kind\` text NOT NULL,
        CONSTRAINT "example_kind" CHECK(kind IN ('proxy', 'agent'))
    );
    --> statement-breakpoint
    ALTER TABLE \`__new_example\` RENAME TO \`example\`;`;

    assert.deepEqual(findTemporaryTableCheckQualifiers(sql), []);
});

test("ignores temporary rebuild tables without a qualified CHECK", () => {
    const sql = `CREATE TABLE \`__new_example\` (\`kind\` text NOT NULL);
    --> statement-breakpoint
    INSERT INTO \`__new_example\` SELECT * FROM \`example\`;`;

    assert.deepEqual(findTemporaryTableCheckQualifiers(sql), []);
});
