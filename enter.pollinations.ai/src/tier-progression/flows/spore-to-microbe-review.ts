#!/usr/bin/env npx tsx
/**
 * Spore to Microbe Review
 *
 * Reads the enriched CSV and applies rules to adjust actions based on usage data.
 * Outputs a reviewed CSV ready for the apply step.
 *
 * Rules:
 *   - block/review + pack_pollen > 0 → skip (paying customer)
 *   - review + error_rate > 80% + requests > 20 → block (hammering API)
 *   - ok users are not modified
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx src/tier-progression/flows/spore-to-microbe-review.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const INPUT_CSV = "src/tier-progression/spore-to-microbe-report-enriched.csv";
const OUTPUT_CSV = "src/tier-progression/spore-to-microbe-report-reviewed.csv";

interface CsvRow {
    [key: string]: string;
}

function parseCsv(content: string): { headers: string[]; rows: CsvRow[] } {
    const lines = content.trim().split("\n");
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map((line) => {
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
                values.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        values.push(current);
        const row: CsvRow = {};
        for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = values[i] || "";
        }
        return row;
    });
    return { headers, rows };
}

function formatCsvValue(v: string): string {
    return v.includes(",") || v.includes('"') ? `"${v}"` : v;
}

async function main(): Promise<void> {
    if (!existsSync(INPUT_CSV)) {
        console.error(`❌ Input CSV not found: ${INPUT_CSV}`);
        console.error("   Run spore-to-microbe-enrich.ts first");
        process.exit(1);
    }

    const content = readFileSync(INPUT_CSV, "utf-8");
    const { headers, rows } = parseCsv(content);

    console.log("📋 Spore to Microbe Review");
    console.log("=".repeat(50));
    console.log(`📋 Input: ${INPUT_CSV} (${rows.length} users)\n`);

    let skippedPayingBlock = 0;
    let skippedPayingReview = 0;
    let upgradedToBlock = 0;
    let unchangedBlock = 0;
    let unchangedReview = 0;
    let unchangedOk = 0;

    const outputRows: string[] = [headers.join(",")];

    for (const row of rows) {
        const action = row.action;
        const packPollen = Number.parseFloat(row.pack_pollen) || 0;
        const errorRate = Number.parseFloat(row.error_rate_pct) || 0;
        const requestCount = Number.parseInt(row.request_count) || 0;

        let newAction = action;

        if (action === "ok") {
            unchangedOk++;
        } else if (packPollen > 0) {
            // Paying customer — don't block
            newAction = "skip";
            if (action === "block") skippedPayingBlock++;
            else skippedPayingReview++;
        } else if (action === "review" && errorRate > 80 && requestCount > 20) {
            // Hammering the API with high error rate — upgrade to block
            newAction = "block";
            upgradedToBlock++;
        } else if (action === "block") {
            unchangedBlock++;
        } else {
            unchangedReview++;
        }

        row.action = newAction;
        const values = headers.map((h) => formatCsvValue(row[h]));
        outputRows.push(values.join(","));
    }

    writeFileSync(OUTPUT_CSV, outputRows.join("\n"));

    const finalBlock = unchangedBlock + upgradedToBlock;
    const finalSkip = skippedPayingBlock + skippedPayingReview;

    console.log("Changes:");
    console.log(`   block → skip (paying customer):  ${skippedPayingBlock}`);
    console.log(`   review → skip (paying customer): ${skippedPayingReview}`);
    console.log(`   review → block (high error):     ${upgradedToBlock}`);
    console.log(`   block unchanged:                 ${unchangedBlock}`);
    console.log(`   review unchanged:                ${unchangedReview}`);
    console.log(`   ok unchanged:                    ${unchangedOk}`);
    console.log();
    console.log(`Final counts:`);
    console.log(`   block: ${finalBlock}`);
    console.log(`   skip:  ${finalSkip}`);
    console.log(`   review: ${unchangedReview}`);
    console.log(`   ok:    ${unchangedOk}`);
    console.log(`\n✅ Reviewed CSV: ${OUTPUT_CSV}`);
}

main().catch(console.error);
