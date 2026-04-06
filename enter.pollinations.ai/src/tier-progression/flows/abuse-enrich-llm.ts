#!/usr/bin/env npx tsx

import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    formatRegisteredAt,
    LEDGER_PATH,
    loadLedger,
    loadRemoteApiKey,
    nowIso,
    requireRunId,
    saveLedger,
} from "../shared/abuse-ledger.ts";

const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

const OVERLAP_SIZE = 20;

type LlmUser = {
    id: string;
    email: string;
    github_username: string;
    created_at_ts: number;
    tier: string;
};

type ChunkResult = {
    ok: boolean;
    scores: Array<{ score: number; signals: string[] }>;
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

function hasFlag(flag: string): boolean {
    return process.argv.slice(2).includes(flag);
}

function buildChunkRanges(
    totalUsers: number,
    chunkSize: number,
    singleChunk: boolean,
): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const step = chunkSize - OVERLAP_SIZE;

    for (let index = 0; index < totalUsers; index += step) {
        ranges.push({
            start: index,
            end: Math.min(index + chunkSize, totalUsers),
        });
        if (singleChunk) break;
    }

    return ranges;
}

function prepareChunkData(chunk: LlmUser[]): {
    csvRows: string[];
    githubToIndex: Map<string, number>;
} {
    const githubToIndex = new Map<string, number>();

    const csvRows = chunk.map((user, index) => {
        const github = user.github_username || `user_${index}`;
        const registered = formatRegisteredAt(user.created_at_ts);
        const upgraded = user.tier !== "spore" && user.tier !== "microbe";
        githubToIndex.set(github, index);
        return `${github},${user.email},${registered},${upgraded}`;
    });

    return { csvRows, githubToIndex };
}

function buildScoringPrompt(csvRows: string[]): string {
    return `Detect coordinated abuse across these users. Score each 0-100.

Signals: cluster (3+ similar usernames/emails, +50), burst (5+ registrations close together, +40), rand (gibberish username, +10), disp (disposable email, +20). Combine with +.

Output CSV only, no explanation: github,score,signals

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`;
}

function parseLlmResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
): Array<{ score: number; signals: string[] }> {
    const results = Array.from({ length: chunkLength }, () => ({
        score: 0,
        signals: [] as string[],
    }));

    for (const line of content.split("\n")) {
        if (!line.trim() || line.startsWith("github,") || !line.includes(",")) {
            continue;
        }

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const github = parts[0]?.trim();
        const score = Number.parseInt(parts[1], 10) || 0;
        const rawSignals = parts[2]?.trim() || "";
        const index = githubToIndex.get(github);
        if (index === undefined) continue;

        results[index] = {
            score: Math.max(0, Math.min(100, score)),
            signals:
                rawSignals && rawSignals !== "ok"
                    ? rawSignals.split("+").filter(Boolean)
                    : [],
        };
    }

    return results;
}

async function callScoringApi(
    chunk: LlmUser[],
    apiKey: string,
    modelName: string,
): Promise<ChunkResult> {
    const { csvRows, githubToIndex } = prepareChunkData(chunk);
    const prompt = buildScoringPrompt(csvRows);

    try {
        const body = JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
        });

        // Use curl via execFileSync instead of Node fetch — Node's undici
        // hangs on long-running LLM responses while curl handles them reliably.
        // Write body to temp file because stdin piping via execFileSync can also hang.
        const tmpFile = join(tmpdir(), `abuse-llm-${Date.now()}.json`);
        writeFileSync(tmpFile, body);
        let result: string;
        try {
            result = execFileSync(
                "curl",
                [
                    "-s",
                    "-m",
                    "120",
                    "-X",
                    "POST",
                    "https://gen.pollinations.ai/v1/chat/completions",
                    "-H",
                    "Content-Type: application/json",
                    "-H",
                    `Authorization: Bearer ${apiKey}`,
                    "-d",
                    `@${tmpFile}`,
                ],
                { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
            );
        } finally {
            try {
                unlinkSync(tmpFile);
            } catch {}
        }

        const data = JSON.parse(result) as {
            choices?: Array<{ message?: { content?: string } }>;
            error?: { message?: string };
        };

        if (data.error) {
            console.error(`⚠️  LLM API error: ${data.error.message}`);
            return { ok: false, scores: [] };
        }

        return {
            ok: true,
            scores: parseLlmResponse(
                data.choices?.[0]?.message?.content || "",
                githubToIndex,
                chunk.length,
            ),
        };
    } catch (error) {
        console.error(
            `⚠️  LLM API call failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { ok: false, scores: [] };
    }
}

function getAction(score: number): "block" | "review" | "ok" {
    if (score >= SCORE_THRESHOLDS.block) return "block";
    if (score >= SCORE_THRESHOLDS.review) return "review";
    return "ok";
}

async function main(): Promise<void> {
    const cohort = getStringFlag("--cohort");
    const explicitRunId = getStringFlag("--run-id");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);
    const chunkSize = getNumberFlag("--chunk-size", 15);
    const modelName = getStringFlag("--model", "gemini");
    const parallelism = getNumberFlag("--parallel", 1);
    const singleChunk = hasFlag("--single-chunk");

    const ledgerRows = loadLedger(ledgerPath);
    const runId = requireRunId(ledgerRows, explicitRunId, cohort);
    const currentRows = ledgerRows
        .filter(
            (row) =>
                row.run_id === runId &&
                (!cohort || row.cohort === cohort) &&
                row.id &&
                row.email &&
                row.created_at_ts,
        )
        .sort(
            (left, right) =>
                Number(right.created_at_ts) - Number(left.created_at_ts),
        );

    if (currentRows.length === 0) {
        console.log("⚠️  No users found for the selected run.");
        return;
    }

    const users: LlmUser[] = currentRows.map((row) => ({
        id: row.id,
        email: row.email,
        github_username: row.github_username,
        created_at_ts: Number.parseInt(row.created_at_ts, 10),
        tier: row.tier,
    }));

    const chunkRanges = buildChunkRanges(users.length, chunkSize, singleChunk);
    const apiKey = loadRemoteApiKey();
    const resultsById = new Map<
        string,
        { status: "scored" | "error"; score: number; signals: string[] }
    >();

    console.log("🤖 Abuse Enrich LLM");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`📊 Users: ${users.length}`);
    console.log(`🧩 Chunks: ${chunkRanges.length}`);
    console.log(`⚡ Parallelism: ${parallelism}`);

    for (
        let batchStart = 0;
        batchStart < chunkRanges.length;
        batchStart += parallelism
    ) {
        const batch = chunkRanges.slice(batchStart, batchStart + parallelism);

        const batchResults = await Promise.all(
            batch.map(async (range) => {
                const chunk = users.slice(range.start, range.end);
                const result = await callScoringApi(chunk, apiKey, modelName);
                return { chunk, result };
            }),
        );

        for (const { chunk, result } of batchResults) {
            for (let index = 0; index < chunk.length; index++) {
                const user = chunk[index];
                const previous = resultsById.get(user.id);

                if (result.ok) {
                    const nextScore = result.scores[index] || {
                        score: 0,
                        signals: [],
                    };
                    if (
                        !previous ||
                        previous.status !== "scored" ||
                        nextScore.score > previous.score
                    ) {
                        resultsById.set(user.id, {
                            status: "scored",
                            score: nextScore.score,
                            signals: nextScore.signals,
                        });
                    }
                } else if (!previous || previous.status !== "scored") {
                    resultsById.set(user.id, {
                        status: "error",
                        score: 0,
                        signals: [],
                    });
                }
            }
        }
    }

    const updatedAt = nowIso();
    let scoredCount = 0;
    let errorCount = 0;
    let blockCount = 0;
    let reviewCount = 0;
    let okCount = 0;

    for (const row of ledgerRows) {
        if (row.run_id !== runId || (cohort && row.cohort !== cohort)) continue;

        const result = resultsById.get(row.id);
        row.llm_checked_at = updatedAt;

        if (!result || result.status === "error") {
            row.llm_status = "error";
            row.llm_score = "";
            row.llm_signals = "";
            row.llm_action = "";
            errorCount++;
            continue;
        }

        row.llm_status = "scored";
        row.llm_score = String(result.score);
        row.llm_signals = result.signals.join("; ");
        row.llm_action = getAction(result.score);
        scoredCount++;

        if (row.llm_action === "block") blockCount++;
        else if (row.llm_action === "review") reviewCount++;
        else okCount++;
    }

    saveLedger(ledgerRows, ledgerPath);

    console.log(`✅ Scored: ${scoredCount}`);
    console.log(`⚠️  Errors: ${errorCount}`);
    console.log(`🔴 Block: ${blockCount}`);
    console.log(`🟠 Review: ${reviewCount}`);
    console.log(`🟢 OK: ${okCount}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
