#!/usr/bin/env npx tsx

import { createInterface } from "node:readline";
import { selectApplyCandidates } from "../shared/abuse-apply.ts";
import { queryD1 } from "../shared/abuse-d1.ts";
import {
    escapeSqlString,
    LEDGER_PATH,
    loadLedger,
    nowIso,
    requireRunId,
    saveLedger,
} from "../shared/abuse-ledger.ts";

type Environment = "staging" | "production";

function getStringFlag(flag: string, fallback = ""): string {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function getNumberFlag(flag: string, fallback: number): number {
    const raw = getStringFlag(flag);
    return raw ? Number.parseInt(raw, 10) : fallback;
}

function hasFlag(flag: string): boolean {
    return process.argv.slice(2).includes(flag);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function confirm(message: string): Promise<boolean> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${message} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "y");
        });
    });
}

async function main(): Promise<void> {
    const cohort = getStringFlag("--cohort");
    const explicitRunId = getStringFlag("--run-id");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);
    const env =
        (getStringFlag("--env", "production") as Environment) || "production";
    const fromTier = getStringFlag("--from-tier", "spore");
    const toTier = getStringFlag("--to-tier", "microbe");
    const batchSize = getNumberFlag("--batch-size", 100);
    const delayMs = getNumberFlag("--delay", 500);
    const max = getNumberFlag("--max", Number.MAX_SAFE_INTEGER);
    const dryRun = hasFlag("--dry-run");

    const ledgerRows = loadLedger(ledgerPath);
    const runId = requireRunId(ledgerRows, explicitRunId, cohort);
    const candidates = selectApplyCandidates(ledgerRows, {
        runId,
        cohort,
        fromTier,
        max,
    });

    console.log("🚫 Abuse Apply");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`🌍 Environment: ${env}`);
    console.log(`🎯 ${fromTier} -> ${toTier}`);
    console.log(`📊 Candidates: ${candidates.length}`);
    if (dryRun) console.log("🔍 Mode: DRY RUN");

    if (candidates.length === 0) {
        console.log("✅ No users to update.");
        return;
    }

    if (!dryRun && env === "production") {
        const ok = await confirm(
            `About to update ${candidates.length} users from ${fromTier} to ${toTier} in production.`,
        );
        if (!ok) {
            console.log("❌ Aborted.");
            return;
        }
    }

    let succeeded = 0;
    let failed = 0;
    const appliedAt = nowIso();

    for (let index = 0; index < candidates.length; index += batchSize) {
        const batch = candidates.slice(index, index + batchSize);

        for (const row of batch) {
            if (dryRun) {
                console.log(`📝 Would update ${row.email} (${row.id})`);
                continue;
            }

            const sql = `UPDATE user
                SET tier = '${escapeSqlString(toTier)}', tier_balance = 0
                WHERE id = '${escapeSqlString(row.id)}'
                  AND tier = '${escapeSqlString(fromTier)}'
                RETURNING id`.replace(/\n/g, " ");

            const results = queryD1(sql, env);
            if (results.length === 0) {
                console.warn(
                    `⚠️  Skipped ${row.id}: tier no longer matched ${fromTier}`,
                );
                failed++;
                continue;
            }

            row.last_applied_at = appliedAt;
            row.tier = toTier;
            succeeded++;
        }

        if (!dryRun && index + batchSize < candidates.length) {
            await sleep(delayMs);
        }
    }

    if (!dryRun) {
        saveLedger(ledgerRows, ledgerPath);
    }

    console.log(`✅ Succeeded: ${succeeded}`);
    console.log(`⚠️  Skipped: ${failed}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
