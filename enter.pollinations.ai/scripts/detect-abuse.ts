#!/usr/bin/env npx tsx
/**
 * Abuse Detection using Pollinations AI
 *
 * LLM-based scoring (0-100 points) with overlapping chunks for pattern detection.
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/abuse-detection/detect-abuse.ts --limit 2000   # Analyze 2000 users
 *   npx tsx scripts/abuse-detection/detect-abuse.ts --single-chunk # Test with first chunk only
 *   npx tsx scripts/abuse-detection/detect-abuse.ts --model claude # Use specific model
 *
 * OPTIONS:
 *   --limit N         Max users to analyze (default: 5000)
 *   --chunk-size N    Users per API call (default: 300)
 *   --model NAME      LLM model to use (default: gemini)
 *   --single-chunk    Only process first chunk (for testing)
 *
 * HOW IT WORKS:
 *   1. Fetch users from D1 database (email, github_username, created_at, tier)
 *   2. Send overlapping chunks to LLM for scoring (20% overlap catches sequential patterns)
 *   3. LLM assigns 0-100 score based on abuse signals
 *   4. Export CSV: abuse-report.csv
 *
 * SCORING (assigned by LLM - cross-user patterns are highest priority):
 *   +50  Cluster pattern (3+ users share prefix/suffix/structure) - HIGHEST
 *   +40  Burst registrations (5+ accounts close together)
 *   +25  Disposable email domain (tempmail, guerrilla, etc.)
 *   +20  Sequential numbers in usernames
 *   +15  Random/gibberish username
 *
 * ACTIONS:
 *   80-100  🔴 Block   - Review immediately
 *   60-79   🟡 Review  - Manual verification needed
 *   30-59   🟠 Monitor - Watch activity
 *   0-29    🟢 OK      - Normal user
 *
 * OUTPUT:
 *   abuse-report.csv - All users sorted by score (action, score, email, github, signals, date)
 *
 * COST: ~$0.10 per 5000 users (minimal token usage with CSV format)
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// Parse arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const chunkIndex = args.indexOf("--chunk-size");
const modelIndex = args.indexOf("--model");
const parallelIndex = args.indexOf("--parallel");
const singleChunk = args.includes("--single-chunk");

const userLimit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : 5000;
const chunkSize = chunkIndex >= 0 ? parseInt(args[chunkIndex + 1]) : 100;
const modelName = modelIndex >= 0 ? args[modelIndex + 1] : "gemini";
const parallelism = parallelIndex >= 0 ? parseInt(args[parallelIndex + 1]) : 1;
const overlapSize = 20; // fixed 20 user overlap

// Configuration
const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
};

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

/**
 * Load API key
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
 * Fetch users from D1
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
 * Score users with overlap for pattern detection
 */
async function scoreUsers(users: User[]): Promise<ScoredUser[]> {
    const apiKey = loadApiKey();
    const mode = parallelism > 1 ? `${parallelism} parallel` : "sequential";
    console.log(
        `\n🤖 Scoring ${users.length} users (chunks of ${chunkSize}, ${mode})...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();

    // Build all chunk ranges
    const chunkRanges: { start: number; end: number }[] = [];
    const maxIterations = singleChunk ? 1 : users.length;
    for (let i = 0; i < maxIterations; i += chunkSize - overlapSize) {
        const end = Math.min(i + chunkSize, users.length);
        if (i >= users.length) break;
        chunkRanges.push({ start: i, end });
    }

    // Process chunks in parallel batches
    let completedChunks = 0;
    for (
        let batchStart = 0;
        batchStart < chunkRanges.length;
        batchStart += parallelism
    ) {
        const batch = chunkRanges.slice(batchStart, batchStart + parallelism);

        console.log(
            `\n⚡ Processing batch ${Math.floor(batchStart / parallelism) + 1}/${Math.ceil(chunkRanges.length / parallelism)} (${batch.length} chunks in parallel)...`,
        );

        const promises = batch.map(async (range) => {
            const chunk = users.slice(range.start, range.end);
            console.log(
                `   🤖 Chunk ${range.start + 1}-${range.end} of ${users.length}`,
            );
            const scores = await callScoringAPI(chunk, apiKey);
            return { range, chunk, scores };
        });

        const results = await Promise.all(promises);

        // Merge all results from this batch
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

        // Print running stats after batch (only count processed users)
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
            ok: processedUsers.filter(
                ([_, s]) => s.score < SCORE_THRESHOLDS.review,
            ).length,
        };
        console.log(
            `   📊 Progress: ${completedChunks}/${chunkRanges.length} chunks (${allScores.size} users) | 🔴 ${stats.block} block | 🟡 ${stats.review} review | 🟢 ${stats.ok} ok`,
        );
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
 * Call Pollinations API for scoring
 */
async function callScoringAPI(
    chunk: User[],
    apiKey: string,
): Promise<{ score: number; signals: string[] }[]> {
    // Prepare data (privacy-conscious)
    // Build a map from github username to chunk index for parsing response
    const githubToIndex = new Map<string, number>();
    const csvRows = chunk.map((u, idx) => {
        const date = new Date(Number(u.created_at) * 1000);
        const humanDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        const github = u.github_username || `user_${idx}`;
        const upgraded = u.tier !== "spore";
        githubToIndex.set(github, idx);
        return `${github},${u.email},${humanDate},${upgraded}`;
    });

    const prompt = `Detect coordinated abuse by analyzing PATTERNS ACROSS MULTIPLE USERS. Score 0-100.

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

    // Log the complete prompt (commented for cleaner output)
    // console.log("\n" + "=".repeat(80));
    // console.log("📝 PROMPT TO LLM:");
    // console.log("=".repeat(80));
    // console.log(prompt);
    // console.log("=".repeat(80) + "\n");

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

        // Log the model output and token usage (commented for cleaner output)
        // console.log("\n" + "=".repeat(80));
        // console.log("🤖 LLM OUTPUT:");
        // console.log("=".repeat(80));
        // console.log(content);
        // console.log("=".repeat(80));
        // if (data.usage) {
        //     console.log(
        //         `📊 Tokens: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`,
        //     );
        // }
        // console.log("");

        // Parse CSV response (github username as key)
        const lines = content.split("\n").filter((line: string) => line.trim());
        const results: { score: number; signals: string[] }[] = new Array(
            chunk.length,
        )
            .fill(null)
            .map(() => ({ score: 0, signals: [] }));

        for (const line of lines) {
            // Skip header if present
            if (line.startsWith("github,") || !line.includes(",")) continue;

            const parts = line.split(",");
            if (parts.length >= 2) {
                const github = parts[0]?.trim();
                const score = parseInt(parts[1]) || 0;
                const reason = parts[2]?.trim() || "";

                const idx = githubToIndex.get(github);
                if (idx !== undefined) {
                    // Convert reason to signals array (split on +)
                    const signals =
                        reason === "ok" || reason === ""
                            ? []
                            : reason.split("+").filter((s: string) => s.trim());
                    results[idx] = {
                        score: Math.min(100, Math.max(0, score)),
                        signals,
                    };
                }
            }
        }

        return results;
    } catch (error) {
        console.error("\n⚠️  API call failed:", error);
    }

    return chunk.map(() => ({ score: 0, signals: [] }));
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
 * Export results - single CSV with all data
 */
function exportResults(users: ScoredUser[]): void {
    const sorted = [...users].sort((a, b) => b.score - a.score);

    // Helper to format date
    const formatDate = (ts: number) => {
        const d = new Date(Number(ts) * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

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

// Main
async function main() {
    console.log("🚀 Abuse Detection");
    console.log("=".repeat(50));
    console.log(
        `📋 Config: ${userLimit} users, chunks of ${chunkSize}, model: ${modelName}`,
    );

    const users = fetchUsers(userLimit);
    if (users.length === 0) {
        console.log("⚠️  No users found");
        return;
    }

    const scored = await scoreUsers(users);
    exportResults(scored);
}

main().catch(console.error);
