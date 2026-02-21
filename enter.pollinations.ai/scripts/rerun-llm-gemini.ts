/**
 * Re-run LLM trust scoring with gemini model for comparison.
 * Reads the existing scoring-data-all.json, re-scores all users via gemini,
 * and writes scoring-data-all-gemini.json with updated trust_score.
 *
 * Saves progress incrementally to a .ndjson file — safe to kill and restart.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { scoreUsers as runLLMScorer } from "./llm-scorer.js";

const INPUT = "scripts/scoring-data-all.json";
const OUTPUT = "scripts/scoring-data-all-gemini.json";
const PROGRESS_FILE = "scripts/gemini-progress.ndjson";

// Same prompt as score-for-upgrade.ts
function buildAbusePrompt(csvRows: string[]): string {
    return `Detect coordinated abuse by analyzing PATTERNS ACROSS MULTIPLE USERS. Score 0-100.

FOCUS: Cross-user patterns are the strongest signals. Look for:
- Common prefixes/suffixes shared by multiple users
- Similar username structures
- Same email domain clusters (especially obscure domains)
- Burst registrations within same time window

SIGNALS (use these codes):
cluster=3+ users share pattern (+50) - HIGHEST PRIORITY
burst=5+ registrations close together (+40)
rand=random/gibberish email username (+10)
disp=disposable/temp email domain (+20)

Output CSV: github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`;
}

function loadProgress(): Map<string, { score: number; signals: string[] }> {
    const map = new Map<string, { score: number; signals: string[] }>();
    if (!existsSync(PROGRESS_FILE)) return map;

    const lines = readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
        try {
            const { username, score, signals } = JSON.parse(line);
            map.set(username, { score, signals });
        } catch {}
    }
    console.log(`Loaded ${map.size} previously scored users from ${PROGRESS_FILE}`);
    return map;
}

function saveChunkProgress(scored: Map<string, { score: number; signals: string[] }>, newEntries: Array<{ username: string; score: number; signals: string[] }>) {
    const lines = newEntries.map(e => JSON.stringify(e)).join("\n") + "\n";
    appendFileSync(PROGRESS_FILE, lines);
}

async function main() {
    console.log("Loading existing data...");
    const data = JSON.parse(readFileSync(INPUT, "utf-8"));
    console.log(`Loaded ${data.length} users`);

    const usernames = data.map((u: any) => u.username).filter(Boolean);
    console.log(`${usernames.length} usernames to score with gemini`);

    // Load previous progress
    const trustScores = loadProgress();
    const alreadyDone = new Set(trustScores.keys());

    // Filter out already-scored usernames
    const remaining = usernames.filter((u: string) => !alreadyDone.has(u));
    console.log(`${remaining.length} remaining (${alreadyDone.size} already done)\n`);

    if (remaining.length === 0) {
        console.log("All users already scored! Writing output...");
    } else {
        const D1_CHUNK = 500;
        const totalChunks = Math.ceil(remaining.length / D1_CHUNK);
        const startTime = Date.now();
        let failedUsers = 0;
        let processed = 0;

        for (let i = 0; i < remaining.length; i += D1_CHUNK) {
            const chunkNum = Math.floor(i / D1_CHUNK) + 1;
            const chunk = remaining.slice(i, i + D1_CHUNK);
            const usernameList = chunk
                .map((u: string) => `'${u.replace(/'/g, "''")}'`)
                .join(", ");
            const userQuery = `SELECT email, github_username, created_at, tier FROM user WHERE github_username IN (${usernameList})`;

            const scored = await runLLMScorer({
                name: `gemini-trust-${i}`,
                userQuery,
                buildPrompt: buildAbusePrompt,
                chunkSize: 100,
                model: "gemini",
                parallelism: 6,
            });

            // Collect new entries for this chunk
            let chunkFailed = 0;
            const newEntries: Array<{ username: string; score: number; signals: string[] }> = [];

            for (const u of scored) {
                if (u.github_username) {
                    const trustScore = 100 - u.score;
                    const signals = u.signals;
                    if (u.score === 0 && signals.length === 0) {
                        chunkFailed++;
                    }
                    trustScores.set(u.github_username, { score: trustScore, signals });
                    newEntries.push({ username: u.github_username, score: trustScore, signals });
                }
            }
            failedUsers += chunkFailed;

            // Save progress incrementally
            saveChunkProgress(trustScores, newEntries);

            processed += chunk.length;
            const totalDone = alreadyDone.size + processed;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = processed / (Number(elapsed) || 1);
            const eta = ((remaining.length - processed) / rate).toFixed(0);
            console.log(
                `\n══ ${chunkNum}/${totalChunks} | ${totalDone}/${usernames.length} total (${((totalDone / usernames.length) * 100).toFixed(1)}%) | ${elapsed}s elapsed | ETA ${eta}s | ${chunkFailed > 0 ? `⚠ ${chunkFailed} failed` : "✓ ok"} | total failed: ${failedUsers} ══\n`,
            );
        }
    }

    // Merge into existing data
    console.log(`\nMerging ${trustScores.size} gemini scores...`);
    const output = data.map((u: any) => {
        const gemini = trustScores.get(u.username);
        return {
            ...u,
            metrics: {
                ...u.metrics,
                trust_score_openai: u.metrics.trust_score, // preserve original
                trust_score: gemini ? gemini.score : u.metrics.trust_score,
            },
            gemini_signals: gemini?.signals ?? [],
        };
    });

    writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
    console.log(`Written to ${OUTPUT}`);

    // Quick comparison stats
    let changed = 0;
    let bigDiff = 0;
    for (const u of output) {
        const openai = u.metrics.trust_score_openai;
        const gemini = u.metrics.trust_score;
        if (openai !== gemini) changed++;
        if (Math.abs(openai - gemini) >= 30) bigDiff++;
    }
    console.log(`\nComparison: ${changed} users with different scores, ${bigDiff} with ≥30pt difference`);
}

main().catch(console.error);
