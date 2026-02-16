#!/usr/bin/env npx tsx
/**
 * Abuse Detection using Pollinations AI
 *
 * LLM-based scoring (0-100 points) with overlapping chunks for pattern detection.
 * Uses the shared llm-scorer pipeline with abuse-specific prompt and thresholds.
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/detect-abuse.ts --limit 2000   # Analyze 2000 users
 *   npx tsx scripts/detect-abuse.ts --single-chunk  # Test with first chunk only
 *   npx tsx scripts/detect-abuse.ts --model claude  # Use specific model
 *
 * OPTIONS:
 *   --limit N         Max users to analyze (default: 5000)
 *   --chunk-size N    Users per API call (default: 100)
 *   --model NAME      LLM model to use (default: gemini)
 *   --single-chunk    Only process first chunk (for testing)
 *   --parallel N      Process N chunks in parallel (default: 1)
 *
 * OUTPUT:
 *   abuse-report.csv - All users sorted by score (action, score, email, github, signals, date)
 */

import { writeFileSync } from "node:fs";
import { type ScoredUser, formatDate, scoreUsers } from "./llm-scorer.ts";

// Configuration
const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

interface ParsedArgs {
    userLimit: number;
    chunkSize: number;
    modelName: string;
    parallelism: number;
    singleChunk: boolean;
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);

    function getArgValue(
        flag: string,
        defaultValue: number | string,
    ): number | string {
        const index = args.indexOf(flag);
        if (index >= 0 && args[index + 1]) {
            return typeof defaultValue === "number"
                ? parseInt(args[index + 1], 10)
                : args[index + 1];
        }
        return defaultValue;
    }

    return {
        userLimit: getArgValue("--limit", 5000) as number,
        chunkSize: getArgValue("--chunk-size", 100) as number,
        modelName: getArgValue("--model", "gemini") as string,
        parallelism: getArgValue("--parallel", 1) as number,
        singleChunk: args.includes("--single-chunk"),
    };
}

/**
 * Build the abuse detection prompt for the LLM
 */
function buildAbusePrompt(csvRows: string[]): string {
    return `Detect coordinated abuse by analyzing PATTERNS ACROSS MULTIPLE USERS. Score 0-100.

FOCUS: Cross-user patterns are the strongest signals. Look for:
- Common prefixes/suffixes shared by multiple users (e.g., "john_dev1", "john_dev2", "john_test3")
- Similar username structures (e.g., "xxxabc123", "xxxdef456", "xxxghi789")
- Repetitive letter/number patterns across users
- Same email domain clusters (especially obscure domains)
- Burst registrations within same time window
- GitHub usernames with sequential numbers or shared base names

SIGNALS (use these codes):
cluster=3+ users share pattern like similar usernames, same suffix template, etc (+50) - HIGHEST PRIORITY
burst=5+ registrations close together (+40)
rand=random/gibberish email username like "qvgimmqbt223", "yklvayco9712" (+10) - only matters in groups
disp=disposable/temp email domain (+20)
upgraded=already verified/upgraded tier (-30) - trust bonus

IMPORTANT: cluster+burst alone = 90 (block). Add rand/disp for extra confidence.
Score 0 for users with normal emails AND normal usernames.

Output CSV: github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Use + to combine. Empty if clean. Focus on GROUPS, not individuals.

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`;
}

type Action = "block" | "review" | "ok";

function getAction(score: number): Action {
    if (score >= SCORE_THRESHOLDS.block) return "block";
    if (score >= SCORE_THRESHOLDS.review) return "review";
    return "ok";
}

function exportResults(users: ScoredUser[]): void {
    const sorted = [...users].sort((a, b) => b.score - a.score);

    const csv = [
        "action,score,email,github_username,signals,tier,registered",
        ...sorted.map(
            (u) =>
                `"${getAction(u.score)}",${u.score},"${u.email}","${u.github_username || ""}","${u.signals.join("; ")}","${u.tier}","${formatDate(u.created_at)}"`,
        ),
    ].join("\n");

    writeFileSync("abuse-report.csv", csv);
    console.log("\nResults: abuse-report.csv");

    const stats = {
        block: sorted.filter((u) => u.score >= SCORE_THRESHOLDS.block).length,
        review: sorted.filter(
            (u) =>
                u.score >= SCORE_THRESHOLDS.review &&
                u.score < SCORE_THRESHOLDS.block,
        ).length,
        ok: sorted.filter((u) => u.score < SCORE_THRESHOLDS.review).length,
    };

    console.log("\nSummary:");
    console.log(`  Block (>=${SCORE_THRESHOLDS.block}): ${stats.block}`);
    console.log(`  Review (>=${SCORE_THRESHOLDS.review}): ${stats.review}`);
    console.log(`  OK (<${SCORE_THRESHOLDS.review}): ${stats.ok}`);

    const topSuspicious = sorted
        .filter((u) => u.score >= SCORE_THRESHOLDS.review)
        .slice(0, 10);

    if (topSuspicious.length > 0) {
        console.log("\nTop suspicious accounts:");
        topSuspicious.forEach((u) => {
            console.log(
                `  ${u.email} | ${u.github_username || "-"} | ${formatDate(u.created_at)}`,
            );
        });
    }
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("Abuse Detection");
    console.log("=".repeat(50));
    console.log(
        `Config: ${config.userLimit} users, chunks of ${config.chunkSize}, model: ${config.modelName}`,
    );

    const scored = await scoreUsers({
        name: "abuse-detection",
        userQuery: `SELECT email, github_username, created_at, tier FROM user ORDER BY created_at DESC LIMIT ${config.userLimit}`,
        buildPrompt: buildAbusePrompt,
        chunkSize: config.chunkSize,
        model: config.modelName,
        parallelism: config.parallelism,
        singleChunk: config.singleChunk,
    });

    if (scored.length === 0) {
        console.log("No users found");
        return;
    }

    exportResults(scored);
}

main().catch(console.error);
