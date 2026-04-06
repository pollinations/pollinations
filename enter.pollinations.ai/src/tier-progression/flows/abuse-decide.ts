#!/usr/bin/env npx tsx

import { applyDowngradeDecisions } from "../shared/abuse-decide.ts";
import {
    LEDGER_PATH,
    loadLedger,
    requireRunId,
    saveLedger,
} from "../shared/abuse-ledger.ts";

function getStringFlag(flag: string, fallback = ""): string {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function main(): Promise<void> {
    const cohort = getStringFlag("--cohort");
    const explicitRunId = getStringFlag("--run-id");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);

    const ledgerRows = loadLedger(ledgerPath);
    const runId = requireRunId(ledgerRows, explicitRunId, cohort);
    const currentRows = ledgerRows.filter(
        (row) => row.run_id === runId && (!cohort || row.cohort === cohort),
    );

    if (currentRows.length === 0) {
        console.log("⚠️  No users found for the selected run.");
        return;
    }

    console.log("🧠 Abuse Decide");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`📊 Users: ${currentRows.length}`);

    const summary = applyDowngradeDecisions(currentRows);

    saveLedger(ledgerRows, ledgerPath);

    console.log(`manual override:          ${summary.manualCount}`);
    console.log(`missing evidence:         ${summary.incompleteCount}`);
    console.log(`paid purchase -> skip:    ${summary.paidSkipCount}`);
    console.log(`review -> block (IP):     ${summary.sharedIpBlockCount}`);
    console.log(`review -> block (error):  ${summary.hammeringCount}`);
    console.log(`ok -> review (IP):        ${summary.sharedIpReviewCount}`);
    console.log(`ok -> review (subnet):    ${summary.sharedSubnetReviewCount}`);
    console.log(`carry llm action:         ${summary.llmCarryCount}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
