/**
 * Chunked bulk upsert for D1 via Drizzle. D1 caps a single statement at 100
 * bound parameters and a single `db.batch()` at ~100 statements, so a wholesale
 * re-sync of thousands of rows needs two-level chunking:
 *   rows  -> multi-row INSERT statements (<= floor(100 / columnsPerRow) rows)
 *   stmts -> db.batch() calls (<= MAX_STATEMENTS_PER_BATCH statements)
 *
 * The `set` clause writes every column from the conflicting row via
 * `excluded.<col>`, so a re-sync overwrites existing rows with fresh GitHub
 * data (last-write-wins on the primary key).
 */

import { getTableColumns, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { getTableConfig } from "drizzle-orm/sqlite-core";

// D1 limits (not documented in-repo; from Cloudflare's published limits).
const MAX_BOUND_PARAMS_PER_STATEMENT = 100;
const MAX_STATEMENTS_PER_BATCH = 100;

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

type BatchableDb = {
    insert: (table: SQLiteTable) => {
        values: (rows: Record<string, unknown>[]) => {
            onConflictDoUpdate: (config: {
                target: SQLiteColumn | SQLiteColumn[];
                set: Record<string, unknown>;
            }) => unknown;
        };
    };
    // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch tuple type
    batch: (stmts: [any, ...any[]]) => Promise<unknown>;
};

/**
 * Upsert `rows` into `table`, conflicting on its primary key column(s), in
 * D1-safe chunks. Returns the number of rows written. No-op for empty input.
 */
export async function chunkedUpsert(
    db: BatchableDb,
    table: SQLiteTable,
    rows: Record<string, unknown>[],
): Promise<number> {
    if (rows.length === 0) return 0;

    const config = getTableConfig(table);
    const pkColumns = config.columns.filter((c) => c.primary);
    if (pkColumns.length === 0) {
        throw new Error(
            `chunkedUpsert: table ${config.name} has no primary key to conflict on`,
        );
    }

    // The `set` clause is keyed by the Drizzle PROPERTY name (camelCase), while
    // the `excluded."..."` reference uses the SQL COLUMN name (snake_case) — so
    // we iterate getTableColumns() (propName -> column) and use column.name for
    // the raw SQL. Keying by column.name silently no-ops on any column whose
    // property name differs (e.g. mergedAt vs merged_at).
    const columnsByProp = getTableColumns(table);
    const setClause: Record<string, unknown> = {};
    for (const [propName, column] of Object.entries(columnsByProp)) {
        if (column.primary) continue; // never overwrite the conflict target
        setClause[propName] = sql.raw(`excluded."${column.name}"`);
    }

    const columnsPerRow = config.columns.length;
    const rowsPerStatement = Math.max(
        1,
        Math.floor(MAX_BOUND_PARAMS_PER_STATEMENT / columnsPerRow),
    );

    // rows -> statements
    const statements = chunk(rows, rowsPerStatement).map((rowChunk) =>
        db
            .insert(table)
            .values(rowChunk)
            .onConflictDoUpdate({
                target: pkColumns as unknown as SQLiteColumn[],
                set: setClause,
            }),
    );

    // statements -> batches
    for (const stmtChunk of chunk(statements, MAX_STATEMENTS_PER_BATCH)) {
        await db.batch(stmtChunk as [unknown, ...unknown[]]);
    }

    return rows.length;
}
