#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const statementBreakpoint = "--> statement-breakpoint";
const defaultMigrationsDir = fileURLToPath(
    new URL("../drizzle/", import.meta.url),
);

export function findTemporaryTableCheckQualifiers(sql) {
    const violations = [];
    let statementOffset = 0;

    for (const statement of sql.split(statementBreakpoint)) {
        if (/\bCHECK\s*\(/i.test(statement)) {
            const match = statement.match(
                /["'`]?(__new_[A-Za-z0-9_]+)["'`]?\s*\./i,
            );
            if (match) {
                const offset = statementOffset + (match.index ?? 0);
                violations.push({
                    line: sql.slice(0, offset).split("\n").length,
                    table: match[1],
                });
            }
        }
        statementOffset += statement.length + statementBreakpoint.length;
    }

    return violations;
}

export async function validateDrizzleMigrations(
    migrationsDir = defaultMigrationsDir,
) {
    const files = (await readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort();
    const violations = [];

    for (const file of files) {
        const sql = await readFile(path.join(migrationsDir, file), "utf8");
        for (const violation of findTemporaryTableCheckQualifiers(sql)) {
            violations.push({ file, ...violation });
        }
    }

    if (violations.length === 0) return;

    const locations = violations
        .map(({ file, line, table }) => `- ${file}:${line} (${table})`)
        .join("\n");
    throw new Error(
        `Invalid SQLite CHECK constraint generated for a temporary table:\n${locations}\n` +
            "drizzle-kit 0.31.x leaves the temporary table qualifier behind after ALTER TABLE RENAME. " +
            "Define SQLite CHECK expressions with unqualified raw column names (for example, sql`type IN (...)`) and regenerate the migration.",
    );
}

const isMain =
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    validateDrizzleMigrations().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
