#!/usr/bin/env npx tsx
/**
 * LLM-based trust scoring for the hourly pipeline.
 *
 * Scores microbe users for coordinated abuse patterns using an LLM.
 * GitHub account validation is a separate pre-step handled by the caller.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --store-status
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --emails-file /tmp/emails.txt
 *
 * Options:
 *   --limit N        Max users to fetch (default: 5000)
 *   --store-status   Write results back to D1
 *   --emails-file    Restrict to emails in a newline-separated file
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeD1, queryD1 } from "../shared/d1.ts";
import {
    buildEmailFilter,
    escapeSqlString,
    loadEmailCohort,
} from "../shared/email-cohort.ts";
import { PIPELINE_DB_BATCH_SIZE } from "../shared/github-identity.ts";
import { llmComplete } from "../shared/llm.ts";

const ENV = "staging";
const CHUNK_SIZE = 90;
const SCORE_WINDOW = 30; // users in the middle of each chunk whose scores are saved
const TRUST_LOOKBACK_SECONDS = 3600;

const PROMPT_TEMPLATE = readFileSync(
    new URL("trust-score-prompt.md", import.meta.url),
    "utf-8",
);

interface User {
    email: string;
    github_id: number;
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
    storeStatus: boolean;
    cohortEmails: string[] | null;
}

export const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

export function parseLLMResponse(
    content: string,
    idToIndex: Map<number, number>,
    chunkLength: number,
    options?: { strict?: boolean },
): Array<{ score: number; signals: string[] }> {
    const strict = options?.strict ?? true;
    const results: Array<{ score: number; signals: string[] }> = Array.from(
        { length: chunkLength },
        () => ({ score: 0, signals: [] }),
    );
    const seen = new Set<number>();

    for (const line of content.split("\n")) {
        if (!line.trim() || line.startsWith("github_id,") || !line.includes(","))
            continue;

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const githubId = Number.parseInt(parts[0]?.trim(), 10);
        const score = Number.parseInt(parts[1], 10);
        const reason = parts[2]?.trim() || "";
        const idx = !Number.isNaN(githubId) ? idToIndex.get(githubId) : undefined;
        if (idx === undefined || Number.isNaN(score)) continue;

        results[idx] = {
            score: Math.min(100, Math.max(0, score)),
            signals:
                reason === "ok" || reason === ""
                    ? []
                    : reason.split("+").filter((s) => s.trim()),
        };
        seen.add(idx);
    }

    if (strict && seen.size < chunkLength) {
        throw new Error(
            "LLM response omitted one or more users from the chunk",
        );
    }

    return results;
}

function formatDate(timestamp: number): string {
    const raw = Number(timestamp);
    const normalized = raw < 1_000_000_000_000 ? raw * 1000 : raw;
    return new Date(normalized).toISOString().slice(0, 16).replace("T", " ");
}

function prepareChunkData(chunk: User[]): {
    csvRows: string[];
    idToIndex: Map<number, number>;
} {
    const idToIndex = new Map<number, number>();
    const csvRows = chunk.map((user, idx) => {
        const upgraded = user.tier !== "spore" && user.tier !== "microbe";
        idToIndex.set(user.github_id, idx);
        return `${user.github_id},${user.github_username ?? ""},${user.email},${formatDate(user.created_at)},${upgraded}`;
    });
    return { csvRows, idToIndex };
}

async function scoreChunk(
    chunk: User[],
    apiKey: string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, idToIndex } = prepareChunkData(chunk);
    const prompt = PROMPT_TEMPLATE + csvRows.join("\n");
    const startedAt = Date.now();

    console.log(`   ⏱️  LLM request: ${chunk.length} users, ${prompt.length} chars`);
    const content = await llmComplete(prompt, { apiKey });
    console.log(`   ✅ LLM response in ${Date.now() - startedAt}ms (${content.length} chars)`);
    return parseLLMResponse(content, idToIndex, chunk.length);
}

async function scoreUsers(
    users: User[],
): Promise<{ scoredUsers: ScoredUser[]; failedUsers: User[] }> {
    const apiKey = loadApiKey();
    console.log(`\n🤖 Scoring ${users.length} users in chunks of ${CHUNK_SIZE}...`);

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const failedEmails = new Set<string>();

    for (let i = 0; i < users.length; i += SCORE_WINDOW) {
        const before = users.slice(Math.max(0, i - SCORE_WINDOW), i);
        const group = users.slice(i, Math.min(i + SCORE_WINDOW, users.length));
        const after = users.slice(i + SCORE_WINDOW, Math.min(i + SCORE_WINDOW * 2, users.length));
        const chunk = [...before, ...group, ...after];
        const startIdx = before.length;

        console.log(`\n⚡ Scoring users ${i + 1}-${i + group.length} of ${users.length} (chunk size: ${chunk.length})`);

        try {
            const scores = await scoreChunk(chunk, apiKey);
            for (let j = startIdx; j < startIdx + group.length && j < scores.length; j++) {
                allScores.set(chunk[j].email, scores[j]);
                failedEmails.delete(chunk[j].email);
            }
        } catch (error) {
            console.error(`   ❌ Chunk failed: ${error instanceof Error ? error.message : String(error)}`);
            for (const user of group) failedEmails.add(user.email);
        }

        // Running tally after each chunk
        const tally = { block: 0, review: 0, ok: 0 };
        for (const s of allScores.values()) {
            tally[getAction(s.score)]++;
        }
        const scored = allScores.size;
        const deferred = failedEmails.size;
        const remaining = users.length - (i + Math.min(SCORE_WINDOW, users.length - i));
        console.log(`   📈 Progress: ${scored} scored, ${deferred} deferred, ${remaining} remaining | block:${tally.block} review:${tally.review} ok:${tally.ok}`);
    }

    const scoredUsers = users.flatMap((user) => {
        const scoreData = allScores.get(user.email);
        if (!scoreData) return [];
        return [{ ...user, score: scoreData.score, signals: scoreData.signals, action: getAction(scoreData.score) } satisfies ScoredUser];
    });
    const failedUsers = users.filter((u) => failedEmails.has(u.email));

    console.log(`\n✅ Scoring complete: ${scoredUsers.length} scored, ${failedUsers.length} deferred`);
    return { scoredUsers, failedUsers };
}

function getAction(score: number): "block" | "review" | "ok" {
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
                `"${u.action}",${u.score},"${u.email}","${u.github_username || ""}","${u.signals.join("; ")}","${u.tier}","${formatDate(u.created_at)}"`,
        ),
    ].join("\n");

    const outPath = fileURLToPath(new URL("abuse-report.csv", import.meta.url));
    writeFileSync(outPath, csv);
    console.log(`\nResults: ${outPath}`);

    const counts = { block: 0, review: 0, ok: 0 };
    for (const u of sorted) counts[u.action]++;
    console.log(`   Block (>=${SCORE_THRESHOLDS.block}): ${counts.block}`);
    console.log(`   Review (>=${SCORE_THRESHOLDS.review}): ${counts.review}`);
    console.log(`   OK (<${SCORE_THRESHOLDS.review}): ${counts.ok}`);
}

function storeTrustScores(scored: ScoredUser[]): void {
    console.log("\n📝 Storing trust scores in D1...");
    let stored = 0;

    for (let i = 0; i < scored.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = scored.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const cases = batch
            .map((u) => `WHEN '${escapeSqlString(u.email)}' THEN ${100 - u.score}`)
            .join(" ");
        const emailList = batch
            .map((u) => `'${escapeSqlString(u.email)}'`)
            .join(", ");

        if (executeD1(ENV, `UPDATE user SET trust_score = CASE email ${cases} END WHERE email IN (${emailList})`)) {
            stored += batch.length;
        }
        console.log(`   📊 ${Math.min(i + PIPELINE_DB_BATCH_SIZE, scored.length)}/${scored.length} stored`);
    }

    const passed = scored.filter((u) => 100 - u.score >= 60).length;
    const failed = scored.filter((u) => 100 - u.score < 60).length;
    console.log(`✅ Stored ${stored} trust scores (${passed} passed, ${failed} failed)`);
}

function fetchUsers(limit: number, cohortEmails: string[] | null): User[] {
    const cohortLabel = cohortEmails ? ` from cohort (${cohortEmails.length})` : "";
    console.log(`📊 Fetching up to ${limit} unprocessed users${cohortLabel}...`);

    const emailFilter = buildEmailFilter("email", cohortEmails);
    const sinceClause = cohortEmails
        ? ""
        : `AND created_at >= ${Math.floor(Date.now() / 1000) - TRUST_LOOKBACK_SECONDS}`;

    const users = queryD1(
        ENV,
        `SELECT email, github_id, github_username, created_at, tier FROM user WHERE COALESCE(banned, 0) = 0 AND trust_score IS NULL ${sinceClause} ${emailFilter} ORDER BY created_at DESC LIMIT ${limit}`,
    ) as unknown as User[];
    console.log(`✅ Fetched ${users.length} users`);
    return users;
}

function loadApiKey(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        console.error("❌ No .testingtokens file found");
        console.error("💡 Create one with: echo 'ENTER_API_TOKEN_REMOTE=sk_...' > .testingtokens");
        process.exit(1);
    }
    const match = readFileSync(tokenFile, "utf-8").match(/ENTER_API_TOKEN_REMOTE=([^\n]+)/);
    if (!match) {
        console.error("❌ No ENTER_API_TOKEN_REMOTE found in .testingtokens");
        process.exit(1);
    }
    return match[1].trim();
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);

    function getStr(flag: string, def: string): string {
        const i = args.indexOf(flag);
        return i >= 0 && args[i + 1] ? args[i + 1] : def;
    }
    function getNum(flag: string, def: number): number {
        const v = getStr(flag, "");
        return v ? parseInt(v, 10) : def;
    }

    let cohortEmails: string[] | null = null;
    const emailsFile = getStr("--emails-file", "");
    try {
        cohortEmails = loadEmailCohort(emailsFile || undefined);
    } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    return {
        userLimit: getNum("--limit", 5000),
        storeStatus: args.includes("--store-status"),
        cohortEmails,
    };
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🚀 New-User Trust Gate");
    console.log("=".repeat(50));
    console.log(`📋 env=${ENV}, limit=${config.userLimit}, store=${config.storeStatus}, cohort=${config.cohortEmails?.length ?? "none"}`);

    const users = fetchUsers(config.userLimit, config.cohortEmails);
    if (users.length === 0) {
        console.log("⚠️  No users found");
        return;
    }

    const { scoredUsers, failedUsers } = await scoreUsers(users);

    if (scoredUsers.length > 0) {
        exportResults(scoredUsers);
        if (config.storeStatus) storeTrustScores(scoredUsers);
    } else {
        console.log("⚠️  No users were successfully trust-scored");
    }

    if (failedUsers.length > 0) {
        console.warn(`⚠️ Deferred ${failedUsers.length} users — will retry on next run.`);
    }
}

const isMain =
    Boolean(process.argv[1]) &&
    import.meta.url === new URL(process.argv[1], "file://").href;

if (isMain) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
