#!/usr/bin/env npx tsx
/**
 * Staging-only backfill: set trust_score = 100 for all non-microbe users with no trust score.
 *
 * Non-microbe users were promoted before the trust gate existed, so they have no trust_score.
 * This backfill gives them a baseline of 100 (fully trusted) so the trust gate doesn't
 * try to re-score them as if they were new microbe users.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/backfills/backfill-trust-scores.ts
 *   npx tsx scripts/user-pipeline/backfills/backfill-trust-scores.ts --dry-run
 */

import { executeD1, queryD1 } from "../shared/d1.ts";
import { PIPELINE_DB_BATCH_SIZE } from "../shared/github-identity.ts";
import { escapeSqlString } from "../shared/email-cohort.ts";

const ENV = "staging" as const;
const FETCH_LIMIT = 200;

function fetchBatch(offset: number): string[] {
    const rows = queryD1(
        ENV,
        `SELECT email FROM user
         WHERE tier != 'microbe'
           AND trust_score IS NULL
           AND COALESCE(banned, 0) = 0
         ORDER BY created_at ASC
         LIMIT ${FETCH_LIMIT} OFFSET ${offset}`,
    ) as unknown as { email: string }[];
    return rows.map((r) => r.email);
}

function storeBatch(emails: string[], dryRun: boolean): number {
    let stored = 0;
    for (let i = 0; i < emails.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = emails.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        const emailList = batch.map((e) => `'${escapeSqlString(e)}'`).join(", ");
        if (dryRun) {
            console.log(`   [dry-run] Would update ${batch.length} users`);
            stored += batch.length;
        } else {
            const ok = executeD1(ENV, `UPDATE user SET trust_score = 100 WHERE email IN (${emailList})`);
            if (ok) stored += batch.length;
        }
    }
    return stored;
}

async function main(): Promise<void> {
    const dryRun = process.argv.includes("--dry-run");

    console.log("🔧 Backfill trust scores for non-microbe users");
    console.log(`   env=staging, dry-run=${dryRun}`);
    console.log("=".repeat(50));

    let offset = 0;
    let totalStored = 0;

    while (true) {
        const emails = fetchBatch(offset);
        if (emails.length === 0) break;

        console.log(`\n📦 Batch at offset ${offset}: ${emails.length} users`);
        const stored = storeBatch(emails, dryRun);
        totalStored += stored;
        offset += emails.length;

        if (emails.length < FETCH_LIMIT) break;
    }

    console.log(`\n✅ Done. ${dryRun ? "Would have updated" : "Updated"} ${totalStored} users.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
