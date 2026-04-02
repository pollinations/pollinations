#!/usr/bin/env npx tsx
/**
 * Spore to Microbe Enrich
 *
 * Reads the scan CSV and enriches each user with Tinybird consumption data.
 * Outputs a new CSV with extra columns: tier_pollen, pack_pollen, total_pollen,
 * request_count, success_count, error_count, error_rate_pct.
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx src/tier-progression/flows/spore-to-microbe-enrich.ts
 *
 * ENVIRONMENT:
 *   TINYBIRD_TOKEN - Admin token for Tinybird SQL API (defaults to .tinyb config)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INPUT_CSV = "src/tier-progression/spore-to-microbe-report.csv";
const OUTPUT_CSV = "src/tier-progression/spore-to-microbe-report-enriched.csv";

interface CsvRow {
    [key: string]: string;
}

interface ConsumptionData {
    tier_pollen: number;
    pack_pollen: number;
    total_pollen: number;
    request_count: number;
    success_count: number;
    error_count: number;
    error_rate_pct: number;
}

const EMPTY_CONSUMPTION: ConsumptionData = {
    tier_pollen: 0,
    pack_pollen: 0,
    total_pollen: 0,
    request_count: 0,
    success_count: 0,
    error_count: 0,
    error_rate_pct: 0,
};

function loadTinybirdToken(): string {
    if (process.env.TINYBIRD_TOKEN) return process.env.TINYBIRD_TOKEN;

    const tinybPath = resolve("observability/.tinyb");
    if (existsSync(tinybPath)) {
        const config = JSON.parse(readFileSync(tinybPath, "utf-8"));
        if (config.token) return config.token;
    }

    console.error("❌ No Tinybird token found");
    console.error(
        "   Set TINYBIRD_TOKEN or ensure observability/.tinyb exists",
    );
    process.exit(1);
}

function loadTinybirdHost(): string {
    const tinybPath = resolve("observability/.tinyb");
    if (existsSync(tinybPath)) {
        const config = JSON.parse(readFileSync(tinybPath, "utf-8"));
        if (config.host) return config.host;
    }
    return "https://api.europe-west2.gcp.tinybird.co";
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

async function queryTinybirdBatch(
    host: string,
    token: string,
    usernames: string[],
): Promise<Map<string, ConsumptionData>> {
    const escaped = usernames
        .map((u) => `'${u.replace(/'/g, "''")}'`)
        .join(",");
    const sql = `SELECT
        user_github_username,
        round(SUM(CASE WHEN selected_meter_slug = 'v1:meter:tier' THEN total_price ELSE 0 END), 4) as tier_pollen,
        round(SUM(CASE WHEN selected_meter_slug = 'v1:meter:pack' THEN total_price ELSE 0 END), 4) as pack_pollen,
        round(SUM(total_price), 4) as total_pollen,
        COUNT(*) as request_count,
        countIf(response_status >= 200 AND response_status < 400) as success_count,
        countIf(response_status >= 400) as error_count,
        round(countIf(response_status >= 400) / COUNT(*) * 100, 1) as error_rate_pct
    FROM generation_event
    WHERE user_github_username IN (${escaped})
    GROUP BY user_github_username
    FORMAT JSON`;

    const results = new Map<string, ConsumptionData>();
    try {
        const response = await fetch(`${host}/v0/sql`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `q=${encodeURIComponent(sql)}`,
        });

        if (!response.ok) {
            const body = await response.text();
            console.error(
                `   ⚠️  Tinybird error: ${response.status} ${body.slice(0, 200)}`,
            );
            return results;
        }

        const result = await response.json();
        for (const row of result.data || []) {
            results.set(row.user_github_username, {
                tier_pollen: row.tier_pollen,
                pack_pollen: row.pack_pollen,
                total_pollen: row.total_pollen,
                request_count: row.request_count,
                success_count: row.success_count,
                error_count: row.error_count,
                error_rate_pct: row.error_rate_pct,
            });
        }
    } catch (error) {
        console.error(`   ⚠️  Tinybird query failed: ${error}`);
    }
    return results;
}

async function main(): Promise<void> {
    if (!existsSync(INPUT_CSV)) {
        console.error(`❌ Input CSV not found: ${INPUT_CSV}`);
        console.error("   Run spore-to-microbe-scan.ts first");
        process.exit(1);
    }

    const token = loadTinybirdToken();
    const host = loadTinybirdHost();
    const content = readFileSync(INPUT_CSV, "utf-8");
    const { headers, rows } = parseCsv(content);

    console.log("🔍 Spore to Microbe Enrich");
    console.log("=".repeat(50));
    console.log(`📋 Input: ${INPUT_CSV} (${rows.length} users)`);
    console.log(`📊 Querying Tinybird for consumption data...\n`);

    const enrichedHeaders = [
        ...headers,
        "tier_pollen",
        "pack_pollen",
        "total_pollen",
        "request_count",
        "success_count",
        "error_count",
        "error_rate_pct",
    ];

    const enrichedRows: string[] = [enrichedHeaders.join(",")];
    let processed = 0;
    let withUsage = 0;
    let withPacks = 0;

    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const usernames = batch.map((r) => r.github_username).filter(Boolean);

        const consumptionMap =
            usernames.length > 0
                ? await queryTinybirdBatch(host, token, usernames)
                : new Map<string, ConsumptionData>();

        for (const row of batch) {
            const consumption =
                consumptionMap.get(row.github_username) || EMPTY_CONSUMPTION;

            if (consumption.total_pollen > 0) withUsage++;
            if (consumption.pack_pollen > 0) withPacks++;

            const values = headers.map((h) => {
                const v = row[h];
                return v.includes(",") || v.includes('"') ? `"${v}"` : v;
            });
            values.push(
                String(consumption.tier_pollen),
                String(consumption.pack_pollen),
                String(consumption.total_pollen),
                String(consumption.request_count),
                String(consumption.success_count),
                String(consumption.error_count),
                String(consumption.error_rate_pct),
            );
            enrichedRows.push(values.join(","));
            processed++;
        }

        console.log(
            `   Progress: ${processed}/${rows.length} | with usage: ${withUsage} | with packs: ${withPacks}`,
        );
    }

    writeFileSync(OUTPUT_CSV, enrichedRows.join("\n"));
    console.log(`\n✅ Enriched CSV: ${OUTPUT_CSV}`);
    console.log(`   Total: ${rows.length} users`);
    console.log(`   With usage: ${withUsage}`);
    console.log(`   With pack purchases: ${withPacks}`);
}

main().catch(console.error);
