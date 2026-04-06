#!/usr/bin/env npx tsx

import {
    escapeSqlString,
    LEDGER_PATH,
    loadLedger,
    nowIso,
    queryTinybirdSql,
    requireRunId,
    saveLedger,
} from "../shared/abuse-ledger.ts";

type UsageRow = {
    lookup_key: string;
    request_count: number;
    error_rate_pct: number;
};

function getStringFlag(flag: string, fallback = ""): string {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function getNumberFlag(flag: string, fallback: number): number {
    const raw = getStringFlag(flag);
    return raw ? Number.parseInt(raw, 10) : fallback;
}

async function main(): Promise<void> {
    const cohort = getStringFlag("--cohort");
    const explicitRunId = getStringFlag("--run-id");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);
    const batchSize = getNumberFlag("--batch-size", 50);

    const ledgerRows = loadLedger(ledgerPath);
    const runId = requireRunId(ledgerRows, explicitRunId, cohort);
    const currentRows = ledgerRows.filter(
        (row) =>
            row.run_id === runId &&
            (!cohort || row.cohort === cohort) &&
            row.id,
    );

    if (currentRows.length === 0) {
        console.log("⚠️  No users found for the selected run.");
        return;
    }

    console.log("📈 Abuse Enrich Usage");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`📊 Users: ${currentRows.length}`);

    const usageMap = new Map<
        string,
        { requestCount: number; errorRatePct: number }
    >();

    for (let index = 0; index < currentRows.length; index += batchSize) {
        const batch = currentRows.slice(index, index + batchSize);
        const ids = batch
            .map((row) => `'${escapeSqlString(row.id)}'`)
            .join(",");
        const sql = `SELECT user_id as lookup_key,
            COUNT(*) as request_count,
            round(countIf(response_status >= 400) / COUNT(*) * 100, 1) as error_rate_pct
        FROM generation_event
        WHERE user_id IN (${ids})
        GROUP BY user_id
        FORMAT JSON`;

        const rows = await queryTinybirdSql<UsageRow>(sql);
        for (const row of rows) {
            usageMap.set(row.lookup_key, {
                requestCount: Number(row.request_count) || 0,
                errorRatePct: Number(row.error_rate_pct) || 0,
            });
        }
    }

    const checkedAt = nowIso();
    for (const row of currentRows) {
        const usage = usageMap.get(row.id) || {
            requestCount: 0,
            errorRatePct: 0,
        };
        row.usage_checked_at = checkedAt;
        row.request_count = String(usage.requestCount);
        row.error_rate_pct = String(usage.errorRatePct);
    }

    saveLedger(ledgerRows, ledgerPath);

    console.log(`✅ Checked: ${currentRows.length}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
