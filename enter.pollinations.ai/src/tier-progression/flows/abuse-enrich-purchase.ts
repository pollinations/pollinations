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

type PurchaseRow = {
    user_id: string;
    purchase_count: number;
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

    console.log("💳 Abuse Enrich Purchase");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`📊 Users: ${currentRows.length}`);

    const purchaseMap = new Map<string, number>();

    for (let index = 0; index < currentRows.length; index += batchSize) {
        const batch = currentRows.slice(index, index + batchSize);
        const ids = batch
            .map((row) => `'${escapeSqlString(row.id)}'`)
            .join(",");
        const sql = `SELECT user_id, count(*) as purchase_count
            FROM stripe_event
            WHERE user_id IN (${ids})
              AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
              AND payment_status = 'paid'
              AND livemode = 1
            GROUP BY user_id
            FORMAT JSON`;

        const rows = await queryTinybirdSql<PurchaseRow>(sql);
        for (const row of rows) {
            purchaseMap.set(row.user_id, Number(row.purchase_count) || 0);
        }
    }

    const checkedAt = nowIso();
    let paidCount = 0;

    for (const row of currentRows) {
        const purchaseCount = purchaseMap.get(row.id) || 0;
        row.purchase_checked_at = checkedAt;
        row.has_paid_purchase = purchaseCount > 0 ? "1" : "0";
        if (purchaseCount > 0) paidCount++;
    }

    saveLedger(ledgerRows, ledgerPath);

    console.log(`✅ Checked: ${currentRows.length}`);
    console.log(`💰 Paid users: ${paidCount}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
