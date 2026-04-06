#!/usr/bin/env npx tsx

import { queryD1 } from "../shared/abuse-d1.ts";
import {
    buildTierCohort,
    escapeSqlString,
    LEDGER_PATH,
    loadLedger,
    normalizeLedgerRow,
    nowIso,
    resetRunState,
    saveLedger,
} from "../shared/abuse-ledger.ts";

type Environment = "staging" | "production";

type CohortUser = {
    id: string;
    email: string;
    github_username: string | null;
    created_at: number;
    tier: string;
};

function getStringFlag(flag: string, fallback = ""): string {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseDateFlag(flag: string): number | null {
    const value = getStringFlag(flag);
    if (!value) return null;

    const timestampMs = Date.parse(value);
    if (Number.isNaN(timestampMs)) {
        throw new Error(`Invalid date for ${flag}: ${value}`);
    }

    return Math.floor(timestampMs / 1000);
}

function parseLastFlag(): number | null {
    const value = getStringFlag("--last");
    if (!value) return null;

    const match = value.match(/^(\d+)(h|d)$/);
    if (!match) {
        throw new Error(
            `Invalid --last value: ${value}. Use formats like 24h or 7d.`,
        );
    }

    const amount = Number.parseInt(match[1], 10);
    const durationMs =
        match[2] === "h" ? amount * 3600_000 : amount * 86_400_000;
    return Math.floor((Date.now() - durationMs) / 1000);
}

function fetchCohortUsers(
    tier: string,
    env: Environment,
    sinceTimestamp: number | null,
    untilTimestamp: number | null,
): CohortUser[] {
    const conditions = [`tier = '${escapeSqlString(tier)}'`];
    if (sinceTimestamp) conditions.push(`created_at > ${sinceTimestamp}`);
    if (untilTimestamp) conditions.push(`created_at < ${untilTimestamp}`);

    const sql = `
        SELECT id, email, github_username, created_at, tier
        FROM user
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC
    `.replace(/\n/g, " ");

    return queryD1(sql, env) as CohortUser[];
}

async function main(): Promise<void> {
    const tier = getStringFlag("--tier", "spore");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);
    const env =
        (getStringFlag("--env", "production") as Environment) || "production";
    const sinceTimestamp = parseDateFlag("--since") ?? parseLastFlag();
    const untilTimestamp = parseDateFlag("--until");

    const runId = nowIso();
    const cohort = buildTierCohort(tier);
    const cohortAddedAt = nowIso();

    console.log("📥 Abuse Cohort");
    console.log("=".repeat(50));
    console.log(`🎯 Cohort: ${cohort}`);
    console.log(`🌍 Environment: ${env}`);
    console.log(`🧾 Run ID: ${runId}`);

    const users = fetchCohortUsers(tier, env, sinceTimestamp, untilTimestamp);
    console.log(`📊 Fetched ${users.length} users`);

    const ledgerRows = loadLedger(ledgerPath);
    const ledgerById = new Map(ledgerRows.map((row, index) => [row.id, index]));
    let appended = 0;
    let updated = 0;

    for (const user of users) {
        const existingIndex = ledgerById.get(user.id);
        const base =
            existingIndex === undefined
                ? normalizeLedgerRow({})
                : normalizeLedgerRow(ledgerRows[existingIndex]);

        const next = resetRunState(base, runId, cohort, cohortAddedAt);
        next.id = user.id;
        next.email = user.email;
        next.github_username = user.github_username ?? "";
        next.tier = user.tier;
        next.created_at_ts = String(user.created_at);

        if (existingIndex === undefined) {
            ledgerById.set(user.id, ledgerRows.length);
            ledgerRows.push(next);
            appended++;
        } else {
            ledgerRows[existingIndex] = next;
            updated++;
        }
    }

    saveLedger(ledgerRows, ledgerPath);

    console.log(`🆕 Appended: ${appended}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`✅ Ledger: ${ledgerPath}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
