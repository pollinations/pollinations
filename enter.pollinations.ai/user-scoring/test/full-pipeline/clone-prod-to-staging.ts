#!/usr/bin/env npx tsx
/**
 * Clone production D1 database to staging, then reset spore/seed users to microbe.
 *
 * Exports all tables from production, imports into staging, takes a pre-reset
 * tier snapshot, and downgrades spore+seed users for pipeline re-testing.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npm run user-pipeline:clone-prod-to-staging
 *   npm run user-pipeline:clone-prod-to-staging -- --skip-clone   # only reset, no clone
 *   npm run user-pipeline:clone-prod-to-staging -- --verify-only  # just show current state
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeD1, queryD1 } from "../shared/d1.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../..");

const EXPORT_PATH = "/tmp/prod-export.sql";
const SNAPSHOT_PATH = "/tmp/pipeline-test-pre-snapshot.json";

const TABLES = [
    "apikey",
    "session",
    "account",
    "verification",
    "user",
] as const;

interface TierSnapshot {
    tiers: Record<string, number>;
    total: number;
    timestamp: string;
}

function wrangler(args: string[], options?: { timeout?: number }): string {
    return execFileSync("npx", ["wrangler", ...args], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 200 * 1024 * 1024,
        cwd: workspaceRoot,
        timeout: options?.timeout ?? 300_000,
    });
}

function getTierDistribution(
    env: "staging" | "production",
): Record<string, number> {
    const rows = queryD1(
        env,
        "SELECT tier, COUNT(*) as n FROM user GROUP BY tier ORDER BY n DESC",
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
        result[String(row.tier)] = Number(row.n);
    }
    return result;
}

function getTableCount(env: "staging" | "production", table: string): number {
    const rows = queryD1(env, `SELECT COUNT(*) as n FROM ${table}`);
    return Number(rows[0]?.n ?? 0);
}

function printTierTable(tiers: Record<string, number>, label: string): void {
    const total = Object.values(tiers).reduce((a, b) => a + b, 0);
    console.log(`\n${label}:`);
    console.log("  Tier      | Count");
    console.log("  ----------|--------");
    for (const [tier, count] of Object.entries(tiers)) {
        console.log(`  ${tier.padEnd(10)}| ${String(count).padStart(6)}`);
    }
    console.log(`  ----------|--------`);
    console.log(`  Total     | ${String(total).padStart(6)}`);
}

function exportProduction(): void {
    console.log("\n📤 Exporting production database...");

    if (existsSync(EXPORT_PATH)) {
        unlinkSync(EXPORT_PATH);
    }

    wrangler(
        [
            "d1",
            "export",
            "DB",
            "--env",
            "production",
            "--remote",
            "--output",
            EXPORT_PATH,
            "--no-schema",
        ],
        { timeout: 600_000 },
    );

    const size = readFileSync(EXPORT_PATH).byteLength;
    console.log(
        `   Export complete: ${EXPORT_PATH} (${(size / 1024 / 1024).toFixed(1)} MB)`,
    );
}

function clearStaging(): void {
    console.log("\n🗑️  Clearing staging tables...");
    for (const table of TABLES) {
        const ok = executeD1("staging", `DELETE FROM ${table}`);
        if (!ok) {
            throw new Error(`Failed to clear staging table: ${table}`);
        }
        console.log(`   Cleared: ${table}`);
    }
}

function prepareImportFile(): string {
    console.log("   Preparing import file...");
    const raw = readFileSync(EXPORT_PATH, "utf-8");
    const lines = raw.split("\n");

    // Separate lines by table, strip d1_migrations and PRAGMAs
    const byTable: Record<string, string[]> = {};
    let stripped = 0;
    for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith("PRAGMA")) {
            stripped++;
            continue;
        }
        if (line.startsWith('INSERT INTO "d1_migrations"')) {
            stripped++;
            continue;
        }
        // Extract table name from INSERT INTO "tablename"
        const match = line.match(/^INSERT INTO "(\w+)"/);
        const table = match ? match[1] : "_other";
        if (!byTable[table]) byTable[table] = [];
        byTable[table].push(line);
    }

    // Import in FK-safe order: parent tables first
    const importOrder = [
        "user",
        "account",
        "session",
        "apikey",
        "verification",
    ];
    const ordered: string[] = [];
    for (const table of importOrder) {
        if (byTable[table]) {
            ordered.push(...byTable[table]);
            console.log(`   ${table}: ${byTable[table].length} rows`);
        }
    }
    // Include any remaining tables not in the explicit order
    for (const [table, rows] of Object.entries(byTable)) {
        if (!importOrder.includes(table) && table !== "_other") {
            ordered.push(...rows);
            console.log(`   ${table}: ${rows.length} rows (extra)`);
        }
    }

    const importPath = `${EXPORT_PATH}.import`;
    writeFileSync(importPath, ordered.join("\n"));
    console.log(
        `   Stripped ${stripped} lines (migrations + PRAGMAs), ${ordered.length} INSERT statements ready`,
    );
    return importPath;
}

function importToStaging(): void {
    console.log("\n📥 Importing production data into staging...");

    const importPath = prepareImportFile();

    wrangler(
        [
            "d1",
            "execute",
            "DB",
            "--env",
            "staging",
            "--remote",
            "--file",
            importPath,
        ],
        { timeout: 600_000 },
    );

    console.log("   Import complete");
}

function verifyClone(): void {
    console.log("\n🔍 Verifying clone...");
    console.log("  Table          | Production | Staging  | Match");
    console.log("  ---------------|------------|----------|------");

    let allMatch = true;
    for (const table of TABLES) {
        const prodCount = getTableCount("production", table);
        const stagingCount = getTableCount("staging", table);
        const match = Math.abs(prodCount - stagingCount) <= 10; // allow small variance from concurrent writes
        if (!match) allMatch = false;
        console.log(
            `  ${table.padEnd(15)}| ${String(prodCount).padStart(10)} | ${String(stagingCount).padStart(8)} | ${match ? "OK" : "MISMATCH"}`,
        );
    }

    if (!allMatch) {
        console.warn(
            "\n⚠️  Some tables have count mismatches (may be due to concurrent production writes)",
        );
    } else {
        console.log("\n✅ All table counts match");
    }
}

function takeSnapshot(): TierSnapshot {
    console.log("\n📸 Taking pre-reset tier snapshot...");
    const tiers = getTierDistribution("staging");
    const total = Object.values(tiers).reduce((a, b) => a + b, 0);
    const snapshot: TierSnapshot = {
        tiers,
        total,
        timestamp: new Date().toISOString(),
    };
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`   Saved to: ${SNAPSHOT_PATH}`);
    printTierTable(tiers, "Pre-reset tier distribution (staging)");
    return snapshot;
}

function resetSporeAndSeed(): void {
    console.log("\n🔄 Downgrading spore+seed users to microbe...");

    const sporeCount = getTableCount("staging", "user WHERE tier = 'spore'");
    const seedCount = getTableCount("staging", "user WHERE tier = 'seed'");
    console.log(`   Spore users to reset: ${sporeCount}`);
    console.log(`   Seed users to reset: ${seedCount}`);

    const ok = executeD1(
        "staging",
        `UPDATE user SET tier = 'microbe', tier_balance = 0, trust_score = NULL, score = NULL, score_checked_at = NULL WHERE tier IN ('spore', 'seed')`,
    );
    if (!ok) {
        throw new Error("Failed to reset spore/seed users");
    }

    console.log(`   ✅ Reset ${sporeCount + seedCount} users to microbe`);
}

function verifyReset(): void {
    const tiers = getTierDistribution("staging");
    printTierTable(tiers, "Post-reset tier distribution (staging)");

    const rows = queryD1(
        "staging",
        `SELECT
			COUNT(*) as total,
			SUM(CASE WHEN trust_score IS NULL THEN 1 ELSE 0 END) as null_trust,
			SUM(CASE WHEN score IS NULL THEN 1 ELSE 0 END) as null_score,
			SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) as banned
		FROM user WHERE tier = 'microbe'`,
    );
    const row = rows[0] ?? {};
    console.log("\nMicrobe user details:");
    console.log(`   Total: ${row.total}`);
    console.log(`   Null trust_score: ${row.null_trust}`);
    console.log(`   Null score: ${row.null_score}`);
    console.log(`   Banned: ${row.banned}`);
}

function main(): void {
    const args = process.argv.slice(2);
    const skipClone = args.includes("--skip-clone");
    const verifyOnly = args.includes("--verify-only");

    console.log("🧪 Clone Production to Staging + Reset");
    console.log("=".repeat(50));

    if (verifyOnly) {
        console.log("📋 Mode: verify only (no changes)");
        const tiers = getTierDistribution("staging");
        printTierTable(tiers, "Current staging tier distribution");
        if (existsSync(SNAPSHOT_PATH)) {
            const snapshot = JSON.parse(
                readFileSync(SNAPSHOT_PATH, "utf-8"),
            ) as TierSnapshot;
            printTierTable(
                snapshot.tiers,
                `Pre-reset snapshot (${snapshot.timestamp})`,
            );
        }
        return;
    }

    if (!skipClone) {
        exportProduction();
        clearStaging();
        importToStaging();
        verifyClone();
    } else {
        console.log("\n⏭️  Skipping clone (using existing staging data)");
    }

    takeSnapshot();
    resetSporeAndSeed();
    verifyReset();

    console.log("\n✅ Clone and reset complete. Ready for pipeline test.");
    console.log(`   Run: npm run user-pipeline:full-pipeline-test`);
}

main();
