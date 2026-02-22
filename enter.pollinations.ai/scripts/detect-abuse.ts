#!/usr/bin/env npx tsx
/**
 * Abuse Detection using Pollinations AI
 *
 * LLM-based scoring (0-100 points) with overlapping chunks for pattern detection.
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

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Configuration
const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

const OVERLAP_SIZE = 20; // Fixed 20 user overlap

interface User {
    email: string;
    github_username: string | null;
    created_at: number;
    tier: string;
}

interface ScoredUser extends User {
    score: number;
    signals: string[];
    action: "block" | "review" | "ok";
}

interface ParsedArgs {
    userLimit: number;
    chunkSize: number;
    modelName: string;
    parallelism: number;
    singleChunk: boolean;
}

/**
 * Parse command line arguments
 */
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
 * Load API key from .testingtokens file
 */
function loadApiKey(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        console.error("❌ No .testingtokens file found");
        console.error(
            "💡 Create one with: echo 'ENTER_API_TOKEN_REMOTE=pk_...' > .testingtokens",
        );
        process.exit(1);
    }

    const content = readFileSync(tokenFile, "utf-8");
    const match = content.match(/ENTER_API_TOKEN_REMOTE=([^\n]+)/);
    if (!match) {
        console.error("❌ No ENTER_API_TOKEN_REMOTE found in .testingtokens");
        process.exit(1);
    }

    return match[1].trim();
}

/**
 * Fetch users from D1 database
 */
function fetchUsers(limit: number): User[] {
    console.log(`📊 Fetching ${limit} most recent users...`);

    const query = `
        SELECT email, github_username, created_at, tier
        FROM user
        ORDER BY created_at DESC
        LIMIT ${limit}
    `.replace(/\n/g, " ");

    try {
        const result = execSync(
            `npx wrangler d1 execute DB --remote --env production --json --command "${query}"`,
            { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );

        const data = JSON.parse(result);
        const users = data[0]?.results || [];
        console.log(`✅ Fetched ${users.length} users`);
        return users;
    } catch (error) {
        console.error("❌ Failed to fetch users:", error);
        return [];
    }
}

/**
 * Format date to human-readable string
 */
function formatDate(timestamp: number): string {
    const d = new Date(Number(timestamp) * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Build chunk ranges with overlap
 */
function buildChunkRanges(
    totalUsers: number,
    chunkSize: number,
    singleChunk: boolean,
): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const maxIterations = singleChunk ? 1 : totalUsers;

    for (let i = 0; i < maxIterations; i += chunkSize - OVERLAP_SIZE) {
        const end = Math.min(i + chunkSize, totalUsers);
        if (i >= totalUsers) break;
        ranges.push({ start: i, end });
    }

    return ranges;
}

/**
 * Prepare CSV data for API prompt
 */
function prepareChunkData(chunk: User[]): {
    csvRows: string[];
    githubToIndex: Map<string, number>;
} {
    const githubToIndex = new Map<string, number>();

    const csvRows = chunk.map((user, idx) => {
        const github = user.github_username || `user_${idx}`;
        const humanDate = formatDate(user.created_at);
        const upgraded = user.tier !== "spore" && user.tier !== "microbe";

        githubToIndex.set(github, idx);
        return `${github},${user.email},${humanDate},${upgraded}`;
    });

    return { csvRows, githubToIndex };
}

/**
 * Build the scoring prompt for the LLM
 */
function buildScoringPrompt(csvRows: string[]): string {
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

/**
 * Parse LLM response into scores
 */
function parseLLMResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
): Array<{ score: number; signals: string[] }> {
    const results: Array<{ score: number; signals: string[] }> = new Array(
        chunkLength,
    )
        .fill(null)
        .map(() => ({ score: 0, signals: [] }));

    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
        // Skip header if present
        if (line.startsWith("github,") || !line.includes(",")) continue;

        const parts = line.split(",");
        if (parts.length >= 2) {
            const github = parts[0]?.trim();
            const score = parseInt(parts[1], 10) || 0;
            const reason = parts[2]?.trim() || "";

            const idx = githubToIndex.get(github);
            if (idx !== undefined) {
                // Convert reason to signals array (split on +)
                const signals =
                    reason === "ok" || reason === ""
                        ? []
                        : reason.split("+").filter((s) => s.trim());

                results[idx] = {
                    score: Math.min(100, Math.max(0, score)),
                    signals,
                };
            }
        }
    }

    return results;
}

/**
 * Call Pollinations API for scoring a single chunk
 */
async function callScoringAPI(
    chunk: User[],
    apiKey: string,
    modelName: string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, githubToIndex } = prepareChunkData(chunk);
    const prompt = buildScoringPrompt(csvRows);

    try {
        const response = await fetch(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                }),
            },
        );

        if (!response.ok) {
            console.error(`\n⚠️  API error: ${response.status}`);
            return chunk.map(() => ({ score: 0, signals: [] }));
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        return parseLLMResponse(content, githubToIndex, chunk.length);
    } catch (error) {
        console.error("\n⚠️  API call failed:", error);
        return chunk.map(() => ({ score: 0, signals: [] }));
    }
}

/**
 * Process a batch of chunks in parallel
 */
async function processBatch(
    batch: Array<{ start: number; end: number }>,
    users: User[],
    apiKey: string,
    modelName: string,
    batchIndex: number,
    totalBatches: number,
): Promise<
    Array<{
        range: { start: number; end: number };
        chunk: User[];
        scores: Array<{ score: number; signals: string[] }>;
    }>
> {
    console.log(
        `\n⚡ Processing batch ${batchIndex}/${totalBatches} (${batch.length} chunks in parallel)...`,
    );

    const promises = batch.map(async (range) => {
        const chunk = users.slice(range.start, range.end);
        console.log(
            `   🤖 Chunk ${range.start + 1}-${range.end} of ${users.length}`,
        );
        const scores = await callScoringAPI(chunk, apiKey, modelName);
        return { range, chunk, scores };
    });

    return Promise.all(promises);
}

/**
 * Print progress statistics
 */
function printProgress(
    completedChunks: number,
    totalChunks: number,
    allScores: Map<string, { score: number; signals: string[] }>,
): void {
    const processedUsers = Array.from(allScores.entries());
    const stats = {
        block: processedUsers.filter(
            ([_, s]) => s.score >= SCORE_THRESHOLDS.block,
        ).length,
        review: processedUsers.filter(
            ([_, s]) =>
                s.score >= SCORE_THRESHOLDS.review &&
                s.score < SCORE_THRESHOLDS.block,
        ).length,
        ok: processedUsers.filter(([_, s]) => s.score < SCORE_THRESHOLDS.review)
            .length,
    };

    console.log(
        `   📊 Progress: ${completedChunks}/${totalChunks} chunks (${allScores.size} users) | ` +
            `🔴 ${stats.block} block | 🟡 ${stats.review} review | 🟢 ${stats.ok} ok`,
    );
}

/**
 * Score users with overlap for pattern detection
 */
async function scoreUsers(
    users: User[],
    config: ParsedArgs,
): Promise<ScoredUser[]> {
    const apiKey = loadApiKey();
    const mode =
        config.parallelism > 1
            ? `${config.parallelism} parallel`
            : "sequential";
    console.log(
        `\n🤖 Scoring ${users.length} users (chunks of ${config.chunkSize}, ${mode})...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const chunkRanges = buildChunkRanges(
        users.length,
        config.chunkSize,
        config.singleChunk,
    );

    let completedChunks = 0;
    const totalBatches = Math.ceil(chunkRanges.length / config.parallelism);

    // Process chunks in parallel batches
    for (
        let batchStart = 0;
        batchStart < chunkRanges.length;
        batchStart += config.parallelism
    ) {
        const batch = chunkRanges.slice(
            batchStart,
            batchStart + config.parallelism,
        );
        const batchIndex = Math.floor(batchStart / config.parallelism) + 1;

        const results = await processBatch(
            batch,
            users,
            apiKey,
            config.modelName,
            batchIndex,
            totalBatches,
        );

        // Merge results from this batch
        for (const { chunk, scores } of results) {
            for (let j = 0; j < chunk.length && j < scores.length; j++) {
                const user = chunk[j];
                const existing = allScores.get(user.email);
                if (!existing || scores[j].score > existing.score) {
                    allScores.set(user.email, scores[j]);
                }
            }
            completedChunks++;
        }

        printProgress(completedChunks, chunkRanges.length, allScores);
    }

    // Build final scored users list
    const scoredUsers: ScoredUser[] = users.map((user) => {
        const scoreData = allScores.get(user.email) || {
            score: 0,
            signals: [],
        };
        return {
            ...user,
            score: scoreData.score,
            signals: scoreData.signals,
            action: getAction(scoreData.score),
        };
    });

    console.log(`\n✅ Scoring complete`);
    return scoredUsers;
}

/**
 * Get action based on score
 */
function getAction(score: number): "block" | "review" | "ok" {
    if (score >= SCORE_THRESHOLDS.block) return "block";
    if (score >= SCORE_THRESHOLDS.review) return "review";
    return "ok";
}

/**
 * Export results to CSV
 */
function exportResults(users: ScoredUser[]): void {
    const sorted = [...users].sort((a, b) => b.score - a.score);

    // Single CSV with action column
    const csv = [
        "action,score,email,github_username,signals,tier,registered",
        ...sorted.map(
            (u) =>
                `"${u.action}",${u.score},"${u.email}","${u.github_username || ""}","${u.signals.join("; ")}","${u.tier}","${formatDate(u.created_at)}"`,
        ),
    ].join("\n");

    writeFileSync("abuse-report.csv", csv);
    console.log("\n📄 Results: abuse-report.csv");

    // Statistics
    const stats = {
        block: sorted.filter((u) => u.action === "block").length,
        review: sorted.filter((u) => u.action === "review").length,
        ok: sorted.filter((u) => u.action === "ok").length,
    };

    console.log("\n📊 Summary:");
    console.log(`   🔴 Block (≥${SCORE_THRESHOLDS.block}): ${stats.block}`);
    console.log(`   🟡 Review (≥${SCORE_THRESHOLDS.review}): ${stats.review}`);
    console.log(`   🟢 OK (<${SCORE_THRESHOLDS.review}): ${stats.ok}`);

    // Top suspicious
    const topSuspicious = sorted
        .filter((u) => u.score >= SCORE_THRESHOLDS.review)
        .slice(0, 10);

    if (topSuspicious.length > 0) {
        console.log("\n🎯 Top suspicious accounts:");
        topSuspicious.forEach((u) => {
            console.log(
                `   ${u.email} | ${u.github_username || "-"} | ${formatDate(u.created_at)}`,
            );
        });
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🚀 Abuse Detection");
    console.log("=".repeat(50));
    console.log(
        `📋 Config: ${config.userLimit} users, chunks of ${config.chunkSize}, model: ${config.modelName}`,
    );

    const users = fetchUsers(config.userLimit);
    if (users.length === 0) {
        console.log("⚠️  No users found");
        return;
    }

    const scored = await scoreUsers(users, config);
    exportResults(scored);
}

main().catch(console.error);
