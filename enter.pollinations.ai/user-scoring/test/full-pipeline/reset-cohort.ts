#!/usr/bin/env npx tsx
/**
 * Reset test cohort to initial state before a test run.
 *
 * - Group A -> microbe, all scores cleared
 * - Groups B+C -> spore, all scores cleared
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/test/reset-cohort.ts
 *   npx tsx user-scoring/test/reset-cohort.ts --verify-only
 */

import { existsSync, readFileSync } from "node:fs";
import { executeD1ForEnv, queryD1ForEnv } from "../shared/d1.ts";
import { buildEmailFilter } from "../shared/email-cohort.ts";

const ENV = "staging" as const;

const FILES = {
    groupA: "/tmp/cohort-group-a.txt",
    daily: "/tmp/cohort-daily.txt",
};

function loadEmails(path: string): string[] {
    if (!existsSync(path)) {
        console.error(`Missing cohort file: ${path}`);
        console.error("Run cohort-setup.ts first.");
        process.exit(1);
    }
    return readFileSync(path, "utf-8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

function resetGroupA(emails: string[]): void {
    const filter = buildEmailFilter("email", emails);
    const ok = executeD1ForEnv(
        ENV,
        `UPDATE user SET tier = 'microbe', tier_balance = 0, trust_score = NULL, score = NULL, score_checked_at = NULL, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${filter}`,
    );
    if (!ok) throw new Error("Failed to reset Group A");
}

function resetDaily(emails: string[]): void {
    const filter = buildEmailFilter("email", emails);
    const ok = executeD1ForEnv(
        ENV,
        `UPDATE user SET tier = 'spore', tier_balance = 0, trust_score = 100, score = NULL, score_checked_at = 0, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${filter}`,
    );
    if (!ok) throw new Error("Failed to reset Groups B+C");
}

function verify(): void {
    const rows = queryD1ForEnv(
        ENV,
        `SELECT tier, COUNT(*) as n,
            SUM(CASE WHEN trust_score IS NULL THEN 1 ELSE 0 END) as no_trust,
            SUM(CASE WHEN score IS NULL THEN 1 ELSE 0 END) as no_score,
            SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) as banned
         FROM user
         WHERE tier IN ('microbe', 'spore') AND COALESCE(banned, 0) = 0
         GROUP BY tier`,
    );

    console.log("\nCohort state after reset:");
    console.log("  tier      | count | no_trust | no_score | banned");
    console.log("  ----------|-------|----------|----------|-------");
    for (const r of rows) {
        console.log(
            `  ${String(r.tier).padEnd(10)}| ${String(r.n).padStart(5)} | ${String(r.no_trust).padStart(8)} | ${String(r.no_score).padStart(8)} | ${String(r.banned).padStart(6)}`,
        );
    }
}

function main(): void {
    const verifyOnly = process.argv.includes("--verify-only");

    if (verifyOnly) {
        console.log("Verifying current cohort state (no changes)...");
        verify();
        return;
    }

    const groupA = loadEmails(FILES.groupA);
    const daily = loadEmails(FILES.daily);

    console.log("Resetting test cohort...");
    console.log(`  Group A: ${groupA.length} users -> microbe`);
    console.log(`  Daily (B+C): ${daily.length} users -> spore`);

    resetGroupA(groupA);
    resetDaily(daily);
    verify();

    console.log("\nReset complete. Ready for testing.");
}

main();
