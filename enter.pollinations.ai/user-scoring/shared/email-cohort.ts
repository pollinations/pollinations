/**
 * Helpers for loading and filtering email cohorts.
 * loadEmailCohort reads a newline-separated email file (returns null if no path given).
 * buildEmailFilter produces a SQL AND clause for restricting queries to a cohort.
 * escapeSqlString escapes single quotes for safe SQL string interpolation.
 */

import { readFileSync } from "node:fs";

export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

export function loadEmailCohort(filePath?: string): string[] | null {
    if (!filePath) return null;

    let content: string;
    try {
        content = readFileSync(filePath, "utf-8");
    } catch (error) {
        throw new Error(
            `Failed to read --emails-file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const emails = Array.from(
        new Set(
            content
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.startsWith("#")),
        ),
    );

    if (emails.length === 0) {
        throw new Error(
            `--emails-file ${filePath} did not contain any emails.`,
        );
    }

    return emails;
}

export function buildEmailFilter(
    column: string,
    emails: string[] | null,
): string {
    if (!emails || emails.length === 0) return "";
    const values = emails
        .map((email) => `'${escapeSqlString(email)}'`)
        .join(", ");
    return ` AND ${column} IN (${values})`;
}
