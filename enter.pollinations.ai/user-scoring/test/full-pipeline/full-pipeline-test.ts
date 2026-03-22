#!/usr/bin/env npx tsx
/**
 * Full pipeline integration test.
 *
 * Runs the hourly pipeline (trust scoring + GitHub check) in a loop until all
 * microbe users have been scored and promoted. Then verifies the results against
 * the pre-reset snapshot taken by clone-prod-to-staging.ts.
 *
 * This triggers the exact same scripts as the hourly GitHub Action:
 *   1. trust-score.ts  (LLM-based abuse detection, 30 users per batch)
 *   2. hourly-new-users.ts  (GitHub scoring + tier assignment)
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npm run user-pipeline:full-pipeline-test
 *   npm run user-pipeline:full-pipeline-test -- --dry-run          # preview without changes
 *   npm run user-pipeline:full-pipeline-test -- --verify-only      # just verify current state
 *   npm run user-pipeline:full-pipeline-test -- --max-iterations 5 # limit loop count
 *   npm run user-pipeline:full-pipeline-test -- --limit 500        # process 500 users per iteration
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { queryD1 } from "../shared/d1.ts";
import { loadDotenvEnv, runNpm } from "../shared/runtime.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(workspaceRoot, "..");
const dotenvPath = resolve(repoRoot, ".env");

const SNAPSHOT_PATH = "/tmp/pipeline-test-pre-snapshot.json";
const TRACE_PATH = "/tmp/pipeline-test-trace.jsonl";
const REPORT_PATH = "/tmp/pipeline-test-report.txt";

const ENV = "staging" as const;
const DEFAULT_MAX_ITERATIONS = 2000;
const DEFAULT_LIMIT = 30;

interface TierSnapshot {
    tiers: Record<string, number>;
    total: number;
    timestamp: string;
}

interface ParsedArgs {
    maxIterations: number;
    limit: number;
    dryRun: boolean;
    verifyOnly: boolean;
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const getNum = (flag: string, def: number): number => {
        const i = args.indexOf(flag);
        return i >= 0 && args[i + 1] ? Number.parseInt(args[i + 1], 10) : def;
    };

    return {
        maxIterations: getNum("--max-iterations", DEFAULT_MAX_ITERATIONS),
        limit: getNum("--limit", DEFAULT_LIMIT),
        dryRun: args.includes("--dry-run"),
        verifyOnly: args.includes("--verify-only"),
    };
}

function getTierDistribution(): Record<string, number> {
    const rows = queryD1(
        ENV,
        "SELECT tier, COUNT(*) as n FROM user GROUP BY tier ORDER BY n DESC",
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
        result[String(row.tier)] = Number(row.n);
    }
    return result;
}

function getUnscoredMicrobeCount(): number {
    const rows = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier = 'microbe' AND trust_score IS NULL AND COALESCE(banned, 0) = 0 AND github_id IS NOT NULL",
    );
    return Number(rows[0]?.n ?? 0);
}

function getUntrustedMicrobeCount(): number {
    const rows = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier = 'microbe' AND trust_score IS NULL AND COALESCE(banned, 0) = 0",
    );
    return Number(rows[0]?.n ?? 0);
}

function printTierComparison(
    before: Record<string, number>,
    after: Record<string, number>,
): void {
    const allTiers = new Set([...Object.keys(before), ...Object.keys(after)]);
    const tierOrder = [
        "microbe",
        "spore",
        "seed",
        "flower",
        "nectar",
        "router",
    ];
    const sorted = [...allTiers].sort(
        (a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b),
    );

    console.log("\n  Tier      | Before | After  | Delta");
    console.log("  ----------|--------|--------|-------");
    for (const tier of sorted) {
        const b = before[tier] ?? 0;
        const a = after[tier] ?? 0;
        const delta = a - b;
        const sign = delta > 0 ? "+" : "";
        console.log(
            `  ${tier.padEnd(10)}| ${String(b).padStart(6)} | ${String(a).padStart(6)} | ${sign}${delta}`,
        );
    }
    const totalBefore = Object.values(before).reduce((s, v) => s + v, 0);
    const totalAfter = Object.values(after).reduce((s, v) => s + v, 0);
    console.log("  ----------|--------|--------|-------");
    console.log(
        `  Total     | ${String(totalBefore).padStart(6)} | ${String(totalAfter).padStart(6)} | ${totalAfter - totalBefore}`,
    );
}

interface VerificationResult {
    passed: number;
    warned: number;
    failed: number;
    lines: string[];
}

function verify(snapshot: TierSnapshot | null): VerificationResult {
    const result: VerificationResult = {
        passed: 0,
        warned: 0,
        failed: 0,
        lines: [],
    };

    function check(
        name: string,
        pass: boolean,
        detail: string,
        severity: "hard" | "soft" = "hard",
    ): void {
        const icon = pass ? "PASS" : severity === "hard" ? "FAIL" : "WARN";
        const line = `  [${icon}] ${name}: ${detail}`;
        result.lines.push(line);
        console.log(line);
        if (pass) result.passed++;
        else if (severity === "hard") result.failed++;
        else result.warned++;
    }

    console.log("\n📋 Verification Results");
    console.log("=".repeat(50));

    // Current state
    const after = getTierDistribution();
    if (snapshot) {
        console.log("\nTier Distribution:");
        printTierComparison(snapshot.tiers, after);
    }

    // Coverage checks
    console.log("\nCoverage Checks:");

    const coverageRows = queryD1(
        ENV,
        `SELECT
			COUNT(*) as total,
			SUM(CASE WHEN trust_score IS NOT NULL THEN 1 ELSE 0 END) as has_trust,
			SUM(CASE WHEN trust_score >= 60 THEN 1 ELSE 0 END) as trusted,
			SUM(CASE WHEN trust_score < 60 AND trust_score IS NOT NULL THEN 1 ELSE 0 END) as blocked,
			SUM(CASE WHEN trust_score IS NULL AND COALESCE(banned, 0) = 0 AND github_id IS NOT NULL THEN 1 ELSE 0 END) as unscored,
			SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) as banned
		FROM user WHERE tier = 'microbe'`,
    );
    const cov = coverageRows[0] ?? {};

    check(
        "All eligible microbe users scored",
        Number(cov.unscored ?? 0) === 0,
        `${cov.has_trust} scored, ${cov.unscored} unscored, ${cov.banned} banned`,
        "soft",
    );

    // Check trusted users got promoted
    const trustedStillMicrobe = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0",
    );
    const stuckCount = Number(trustedStillMicrobe[0]?.n ?? 0);
    check(
        "All trusted users promoted",
        stuckCount === 0,
        `${stuckCount} trusted users still at microbe`,
        "soft",
    );

    // Check promoted users have scores
    const promotedNoScore = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier IN ('spore', 'seed') AND score IS NULL AND COALESCE(banned, 0) = 0",
    );
    const noScoreCount = Number(promotedNoScore[0]?.n ?? 0);
    check(
        "All promoted users have GitHub score",
        noScoreCount === 0,
        `${noScoreCount} promoted users without score`,
        "soft",
    );

    // Consistency checks
    console.log("\nConsistency Checks:");

    const seedLowScore = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier = 'seed' AND score IS NOT NULL AND score < 8",
    );
    check(
        "No seed users with score < 8",
        Number(seedLowScore[0]?.n ?? 0) === 0,
        `${seedLowScore[0]?.n ?? 0} seed users with low score`,
    );

    const sporeLowTrust = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE tier = 'spore' AND trust_score IS NOT NULL AND trust_score < 60 AND COALESCE(banned, 0) = 0",
    );
    check(
        "No spore users with trust_score < 60",
        Number(sporeLowTrust[0]?.n ?? 0) === 0,
        `${sporeLowTrust[0]?.n ?? 0} spore users with low trust`,
    );

    const bannedPromoted = queryD1(
        ENV,
        "SELECT COUNT(*) as n FROM user WHERE COALESCE(banned, 0) = 1 AND tier IN ('spore', 'seed')",
    );
    check(
        "No banned users promoted",
        Number(bannedPromoted[0]?.n ?? 0) === 0,
        `${bannedPromoted[0]?.n ?? 0} banned users at spore/seed`,
    );

    // Trace analysis
    if (existsSync(TRACE_PATH)) {
        console.log("\nTrace Analysis:");
        const traceContent = readFileSync(TRACE_PATH, "utf-8");
        const lines = traceContent.split("\n").filter((l) => l.trim());
        let anomalies = 0;
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.reconcile_issue) anomalies++;
            } catch {
                // skip malformed lines
            }
        }
        check(
            "Trace anomalies < 1%",
            anomalies < lines.length * 0.01,
            `${anomalies} anomalies in ${lines.length} trace entries`,
            "soft",
        );
    }

    // Delta analysis
    if (snapshot) {
        console.log("\nDelta Analysis:");
        const beforePromoted =
            (snapshot.tiers.spore ?? 0) + (snapshot.tiers.seed ?? 0);
        const afterPromoted = (after.spore ?? 0) + (after.seed ?? 0);
        const ratio = beforePromoted > 0 ? afterPromoted / beforePromoted : 1;
        check(
            "Promotion rate within 10% of original",
            ratio >= 0.9,
            `before=${beforePromoted}, after=${afterPromoted}, ratio=${(ratio * 100).toFixed(1)}%`,
            "soft",
        );
    }

    // Summary
    console.log(
        `\n${result.passed} passed, ${result.warned} warned, ${result.failed} failed`,
    );

    return result;
}

function main(): void {
    const config = parseArguments();

    console.log("🧪 Full Pipeline Integration Test");
    console.log("=".repeat(50));

    // Load pre-reset snapshot
    let snapshot: TierSnapshot | null = null;
    if (existsSync(SNAPSHOT_PATH)) {
        snapshot = JSON.parse(
            readFileSync(SNAPSHOT_PATH, "utf-8"),
        ) as TierSnapshot;
        console.log(`📸 Pre-reset snapshot loaded (${snapshot.timestamp})`);
    } else {
        console.warn(
            "⚠️  No pre-reset snapshot found. Run clone-prod-to-staging first.",
        );
    }

    if (config.verifyOnly) {
        console.log("📋 Mode: verify only (no pipeline runs)");
        const result = verify(snapshot);
        saveReport(result, snapshot);
        if (result.failed > 0) process.exit(1);
        return;
    }

    const childEnv = loadDotenvEnv(dotenvPath);
    childEnv.CLOUDFLARE_ENV = ENV;

    // Clear trace file
    if (existsSync(TRACE_PATH)) {
        writeFileSync(TRACE_PATH, "");
    }

    const startTime = Date.now();
    let iteration = 0;

    while (iteration < config.maxIterations) {
        iteration++;
        const remaining = getUnscoredMicrobeCount();

        console.log(`\n${"=".repeat(50)}`);
        console.log(`🔄 Iteration ${iteration}/${config.maxIterations}`);
        console.log(`   Unscored microbe users: ${remaining}`);

        if (remaining === 0) {
            console.log(
                "✅ All microbe users have been scored. Pipeline converged.",
            );
            break;
        }

        // Step 1: Trust scoring
        console.log("\n🔍 Running trust scoring...");
        const trustArgs = [
            "run",
            "user-pipeline:trust-score",
            "--",
            "--store-status",
            "--limit",
            String(config.limit),
            "--trace-file",
            TRACE_PATH,
        ];
        if (config.dryRun) {
            console.log(`   [DRY RUN] Would run: npm ${trustArgs.join(" ")}`);
        } else {
            runNpm(workspaceRoot, trustArgs, childEnv, { timeout: 21600_000 });
        }

        // Step 2: Hourly new-users (GitHub check + tier assignment)
        console.log("\n🌱 Running hourly new-users pipeline...");
        const hourlyArgs = [
            "run",
            "user-pipeline:hourly-new-users",
            "--",
            "--trace-file",
            TRACE_PATH,
        ];
        if (config.dryRun) {
            console.log(`   [DRY RUN] Would run: npm ${hourlyArgs.join(" ")}`);
        } else {
            runNpm(workspaceRoot, hourlyArgs, childEnv, {
                timeout: 21600_000,
            });
        }

        // Progress report
        const afterTiers = getTierDistribution();
        const elapsed = ((Date.now() - startTime) / 60_000).toFixed(1);
        console.log(
            `\n📊 After iteration ${iteration} (${elapsed} min elapsed):`,
        );
        for (const [tier, count] of Object.entries(afterTiers)) {
            console.log(`   ${tier}: ${count}`);
        }

        if (config.dryRun) {
            console.log("\n[DRY RUN] Stopping after first iteration preview");
            break;
        }
    }

    if (iteration >= config.maxIterations) {
        const stillUnscored = getUntrustedMicrobeCount();
        console.warn(
            `\n⚠️  Max iterations reached. ${stillUnscored} microbe users still unscored.`,
        );
    }

    const totalElapsed = ((Date.now() - startTime) / 60_000).toFixed(1);
    console.log(
        `\n⏱️  Total time: ${totalElapsed} minutes, ${iteration} iterations`,
    );

    // Verify results
    const result = verify(snapshot);
    saveReport(result, snapshot, iteration, totalElapsed);

    if (result.failed > 0) {
        console.error("\n❌ Pipeline test has hard failures");
        process.exit(1);
    }

    console.log("\n✅ Pipeline test complete");
}

function saveReport(
    result: VerificationResult,
    snapshot: TierSnapshot | null,
    iterations?: number,
    elapsed?: string,
): void {
    const lines = [
        "Pipeline Test Report",
        `Date: ${new Date().toISOString()}`,
        ...(iterations !== undefined ? [`Iterations: ${iterations}`] : []),
        ...(elapsed !== undefined ? [`Duration: ${elapsed} minutes`] : []),
        ...(snapshot ? [`Pre-reset snapshot: ${snapshot.timestamp}`] : []),
        "",
        ...result.lines,
        "",
        `Summary: ${result.passed} passed, ${result.warned} warned, ${result.failed} failed`,
    ];
    writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
    console.log(`\n📝 Report saved to: ${REPORT_PATH}`);
}

main();
