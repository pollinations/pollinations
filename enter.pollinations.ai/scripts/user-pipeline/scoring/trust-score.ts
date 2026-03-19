#!/usr/bin/env npx tsx
/**
 * New-user trust scoring for the hourly pipeline.
 *
 * This script only operates on users who have not yet been trust-scored.
 * It validates GitHub account existence first, bans deleted/invalid accounts,
 * then runs LLM trust scoring on the remaining users.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --store-status
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --emails-file /tmp/replay-emails.txt
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --single-chunk
 *
 * Options:
 *   --limit N         Max users to analyze (default: 5000)
 *   --chunk-size N    Users per API call (default: 100)
 *   --model NAME      LLM model to use (default: gemini)
 *   --single-chunk    Only process first chunk (for testing)
 *   --parallel N      Process N chunks in parallel (default: 1)
 *   --store-status    Write trust_score and account bans back to D1
 *   --emails-file     Only process emails listed in a newline-separated file
 *   --env staging     D1 environment to use (staging only on this branch)
 *
 * Output:
 *   abuse-report.csv - Successfully scored users sorted by abuse score
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { executeD1, queryD1 } from "../shared/d1.ts";
import {
    buildEmailFilter,
    escapeSqlString,
    loadEmailCohort,
} from "../shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_ACCOUNT_DELETED_REASON,
    PIPELINE_DB_BATCH_SIZE,
} from "../shared/github-identity.ts";
import { validateAccountRecords } from "./github-score.ts";

const OVERLAP_SIZE = 20;
const DEFAULT_CHUNK_SIZE = 100;
const TRUST_LOOKBACK_SECONDS = 3600;
const LLM_TIMEOUT_MS = 45_000;

type Environment = "staging";

interface User {
    email: string;
    github_id: number | null;
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
    env: Environment;
    userLimit: number;
    chunkSize: number;
    modelName: string;
    parallelism: number;
    singleChunk: boolean;
    storeStatus: boolean;
    cohortEmails: string[] | null;
}

interface ScoreUsersResult {
    scoredUsers: ScoredUser[];
    failedUsers: User[];
}

export const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

export function parseLLMResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
    options?: { strict?: boolean },
): Array<{ score: number; signals: string[] }> {
    const strict = options?.strict ?? true;
    const results: Array<{ score: number; signals: string[] }> = Array.from(
        { length: chunkLength },
        () => ({
            score: 0,
            signals: [],
        }),
    );
    const seen = new Set<number>();

    for (const line of content.split("\n")) {
        if (!line.trim() || line.startsWith("github,") || !line.includes(",")) {
            continue;
        }

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const github = parts[0]?.trim();
        const score = Number.parseInt(parts[1], 10);
        const reason = parts[2]?.trim() || "";
        const idx = github ? githubToIndex.get(github) : undefined;
        if (idx === undefined || Number.isNaN(score)) continue;

        results[idx] = {
            score: Math.min(100, Math.max(0, score)),
            signals:
                reason === "ok" || reason === ""
                    ? []
                    : reason.split("+").filter((signal) => signal.trim()),
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

function buildTrustScorePrompt(csvRows: string[]): string {
    return `Detect coordinated abuse by analyzing patterns across multiple users. Score 0-100.

Focus on cross-user patterns:
- common prefixes/suffixes or shared username templates
- similar username structures with small variations
- same obscure or disposable email domains
- burst registrations close together in time
- sequential numbering or shared base names in GitHub usernames

Signal codes:
- cluster = 3+ users share a naming or template pattern
- burst = 5+ users registered close together
- rand = random or gibberish-looking username or email local-part, only meaningful in groups
- disp = disposable or suspicious email domain
- upgraded = already upgraded tier, trust bonus

Return only raw CSV.
No markdown.
No explanations, summaries, or questions.
No code fences.
Start with the exact header: github,score,signals
Return exactly one row for every input user.
Reuse the exact github value from the input.
If a user is clean, return 0 and leave signals empty.
If unsure, prefer 0 over omitting the user.
Join multiple signals with +.

Example:
github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`.trim();
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);

    function getStr(flag: string, defaultValue: string): string {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : defaultValue;
    }

    function getNum(flag: string, defaultValue: number): number {
        const value = getStr(flag, "");
        return value ? parseInt(value, 10) : defaultValue;
    }

    const env = getStr("--env", "staging");
    if (env !== "staging") {
        console.error(
            `Unsupported --env ${env}. This branch is locked to staging and cannot write to production.`,
        );
        process.exit(1);
    }

    const chunkSize = getNum("--chunk-size", DEFAULT_CHUNK_SIZE);
    if (chunkSize <= OVERLAP_SIZE) {
        console.error(
            `Invalid --chunk-size ${chunkSize}. It must be greater than ${OVERLAP_SIZE}.`,
        );
        process.exit(1);
    }

    const emailsFile = getStr("--emails-file", "");

    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(emailsFile || undefined);
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        env: "staging",
        userLimit: getNum("--limit", 5000),
        chunkSize,
        modelName: getStr("--model", "gemini"),
        parallelism: getNum("--parallel", 1),
        singleChunk: args.includes("--single-chunk"),
        storeStatus: args.includes("--store-status"),
        cohortEmails,
    };
}

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

function fetchUsers(
    env: Environment,
    limit: number,
    cohortEmails: string[] | null,
): User[] {
    const cohortLabel = cohortEmails
        ? ` from email cohort (${cohortEmails.length})`
        : "";
    console.log(
        `📊 Fetching ${limit} most recent unprocessed users${cohortLabel}...`,
    );

    const emailFilter = buildEmailFilter("email", cohortEmails);
    const sinceClause = cohortEmails
        ? ""
        : `AND created_at >= ${Math.floor(Date.now() / 1000) - TRUST_LOOKBACK_SECONDS}`;
    const query = `
        SELECT email, github_id, github_username, created_at, tier
        FROM user
        WHERE COALESCE(banned, 0) = 0
        AND trust_score IS NULL
        ${sinceClause}
        ${emailFilter}
        ORDER BY created_at DESC
        LIMIT ${limit}
    `.replace(/\n/g, " ");

    const users = queryD1(env, query);
    console.log(`✅ Fetched ${users.length} users`);
    return users;
}

function formatDate(timestamp: number): string {
    const raw = Number(timestamp);
    const normalized = raw < 1_000_000_000_000 ? raw * 1000 : raw;
    const d = new Date(normalized);
    return d.toISOString().slice(0, 16).replace("T", " ");
}

async function validateGithubAccounts(
    users: User[],
    env: Environment,
    applyChanges: boolean,
): Promise<User[]> {
    if (users.length === 0) return [];

    const missingOrInvalidUsers = users.filter(
        (user) => !Number.isInteger(user.github_id) || user.github_id === null,
    );
    const usersWithGithub = users.filter(
        (user): user is User & { github_id: number } =>
            Number.isInteger(user.github_id) && user.github_id !== null,
    );

    if (missingOrInvalidUsers.length > 0) {
        if (applyChanges) {
            const banned = banUsersByEmails(
                env,
                missingOrInvalidUsers.map((user) => user.email),
            );
            console.log(
                `🚫 Banned ${banned} new users with missing/invalid GitHub IDs`,
            );
        } else {
            console.log(
                `🚫 Detected ${missingOrInvalidUsers.length} users with missing/invalid GitHub IDs`,
            );
        }
    }

    if (usersWithGithub.length === 0) {
        return [];
    }

    const results = await validateAccountRecords(usersWithGithub);
    const deletedGithubIds = Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === GITHUB_ACCOUNT_DELETED_REASON &&
                Number.isInteger(result.github_id)
                    ? [result.github_id]
                    : [],
            ),
        ),
    );
    if (deletedGithubIds.length > 0) {
        if (applyChanges) {
            const banned = banUsersByGithubIds(env, deletedGithubIds);
            console.log(
                `🚫 Banned ${banned} new users with deleted GitHub accounts`,
            );
        } else {
            console.log(
                `🚫 Detected ${deletedGithubIds.length} users with deleted GitHub accounts`,
            );
        }
    }

    const deletedSet = new Set(deletedGithubIds);
    return usersWithGithub.flatMap((user) => {
        if (deletedSet.has(user.github_id)) {
            return [];
        }
        return [user];
    });
}

function buildChunkRanges(
    totalUsers: number,
    chunkSize: number,
    singleChunk: boolean,
): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const step = chunkSize - OVERLAP_SIZE;

    for (let i = 0; i < totalUsers; i += step) {
        ranges.push({ start: i, end: Math.min(i + chunkSize, totalUsers) });
        if (singleChunk) break;
    }

    return ranges;
}

function prepareChunkData(chunk: User[]): {
    csvRows: string[];
    githubToIndex: Map<string, number>;
} {
    const githubToIndex = new Map<string, number>();
    const csvRows = chunk.map((user, idx) => {
        const github = user.github_username?.trim() || `user_${idx}`;
        const humanDate = formatDate(user.created_at);
        const upgraded = user.tier !== "spore" && user.tier !== "microbe";
        githubToIndex.set(github, idx);
        return `${github},${user.email},${humanDate},${upgraded}`;
    });

    return { csvRows, githubToIndex };
}

async function callScoringAPI(
    chunk: User[],
    apiKey: string,
    modelName: string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, githubToIndex } = prepareChunkData(chunk);
    const prompt = buildTrustScorePrompt(csvRows);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
        console.log(
            `   ⏱️  LLM request: ${chunk.length} users, ${prompt.length} chars, model=${modelName}`,
        );
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
                signal: controller.signal,
            },
        );

        if (!response.ok) {
            const body = await response.text();
            throw new Error(
                `LLM API returned HTTP ${response.status}: ${body.slice(0, 200)}`,
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        console.log(
            `   ✅ LLM response in ${Date.now() - startedAt}ms (${content.length} chars)`,
        );
        return parseLLMResponse(content, githubToIndex, chunk.length);
    } finally {
        clearTimeout(timeout);
    }
}

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
        scores: Array<{ score: number; signals: string[] }> | null;
        error: string | null;
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
        try {
            const scores = await callScoringAPI(chunk, apiKey, modelName);
            return { range, chunk, scores, error: null };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error(
                `   ❌ Chunk ${range.start + 1}-${range.end} failed: ${message}`,
            );
            return { range, chunk, scores: null, error: message };
        }
    });

    return Promise.all(promises);
}

function printProgress(
    completedChunks: number,
    totalChunks: number,
    allScores: Map<string, { score: number; signals: string[] }>,
    failedUsers: number,
): void {
    let block = 0;
    let review = 0;
    let ok = 0;

    for (const { score } of allScores.values()) {
        if (score >= SCORE_THRESHOLDS.block) block++;
        else if (score >= SCORE_THRESHOLDS.review) review++;
        else ok++;
    }

    console.log(
        `   Progress: ${completedChunks}/${totalChunks} chunks (${allScores.size} scored, ${failedUsers} failed) | block: ${block} | review: ${review} | ok: ${ok}`,
    );
}

async function scoreUsers(
    users: User[],
    config: ParsedArgs,
): Promise<ScoreUsersResult> {
    const apiKey = loadApiKey();
    const mode =
        config.parallelism > 1
            ? `${config.parallelism} parallel`
            : "sequential";
    console.log(
        `\n🤖 Scoring ${users.length} users (chunks of ${config.chunkSize}, ${mode})...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const failedEmails = new Set<string>();
    const chunkRanges = buildChunkRanges(
        users.length,
        config.chunkSize,
        config.singleChunk,
    );

    let completedChunks = 0;
    const totalBatches = Math.ceil(chunkRanges.length / config.parallelism);

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

        for (const { chunk, scores } of results) {
            if (!scores) {
                for (const user of chunk) failedEmails.add(user.email);
                completedChunks++;
                continue;
            }

            for (let j = 0; j < chunk.length && j < scores.length; j++) {
                const user = chunk[j];
                const existing = allScores.get(user.email);
                if (!existing || scores[j].score > existing.score) {
                    allScores.set(user.email, scores[j]);
                }
                failedEmails.delete(user.email);
            }
            completedChunks++;
        }

        printProgress(
            completedChunks,
            chunkRanges.length,
            allScores,
            failedEmails.size,
        );
    }

    const scoredUsers = users.flatMap((user) => {
        const scoreData = allScores.get(user.email);
        if (!scoreData) return [];
        return [
            {
                ...user,
                score: scoreData.score,
                signals: scoreData.signals,
                action: getAction(scoreData.score),
            } satisfies ScoredUser,
        ];
    });

    const failedUsers = users.filter((user) => failedEmails.has(user.email));
    console.log(
        `\n✅ Scoring complete: ${scoredUsers.length} scored, ${failedUsers.length} deferred`,
    );

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
            (user) =>
                `"${user.action}",${user.score},"${user.email}","${user.github_username || ""}","${user.signals.join("; ")}","${user.tier}","${formatDate(user.created_at)}"`,
        ),
    ].join("\n");

    writeFileSync("abuse-report.csv", csv);
    console.log("\nResults: abuse-report.csv");

    const counts = { block: 0, review: 0, ok: 0 };
    for (const user of sorted) counts[user.action]++;

    console.log("\nSummary:");
    console.log(`   Block (>=${SCORE_THRESHOLDS.block}): ${counts.block}`);
    console.log(`   Review (>=${SCORE_THRESHOLDS.review}): ${counts.review}`);
    console.log(`   OK (<${SCORE_THRESHOLDS.review}): ${counts.ok}`);
}

function storeTrustScores(env: Environment, scored: ScoredUser[]): void {
    console.log("\n📝 Storing trust scores in D1...");
    let stored = 0;

    for (let i = 0; i < scored.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = scored.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const cases = batch
            .map((user) => {
                const trustScore = 100 - user.score;
                return `WHEN '${escapeSqlString(user.email)}' THEN ${trustScore}`;
            })
            .join(" ");
        const emailList = batch
            .map((user) => `'${escapeSqlString(user.email)}'`)
            .join(", ");
        const query = `UPDATE user SET trust_score = CASE email ${cases} END WHERE email IN (${emailList})`;

        if (executeD1(env, query)) {
            stored += batch.length;
        }

        console.log(
            `   📊 ${Math.min(i + PIPELINE_DB_BATCH_SIZE, scored.length)}/${scored.length} trust scores stored`,
        );
    }

    const passed = scored.filter((user) => 100 - user.score >= 60).length;
    const failed = scored.filter((user) => 100 - user.score < 60).length;
    console.log(
        `✅ Stored ${stored} trust scores (${passed} passed, ${failed} failed)`,
    );
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🚀 New-User Trust Gate");
    console.log("=".repeat(50));
    const labels: string[] = [];
    if (config.storeStatus) labels.push("store-status");
    if (config.cohortEmails) {
        labels.push(`email cohort (${config.cohortEmails.length})`);
    } else {
        labels.push("last 1h only");
    }
    const extra = labels.length > 0 ? `, ${labels.join(", ")}` : "";
    console.log(
        `📋 Config: env=${config.env}, ${config.userLimit} users, chunks of ${config.chunkSize}, model: ${config.modelName}${extra}`,
    );

    const fetchedUsers = fetchUsers(
        config.env,
        config.userLimit,
        config.cohortEmails,
    );
    if (fetchedUsers.length === 0) {
        console.log("⚠️  No users found");
        return;
    }

    const validUsers = await validateGithubAccounts(
        fetchedUsers,
        config.env,
        config.storeStatus,
    );
    if (validUsers.length === 0) {
        console.log("✅ No valid new users left for trust scoring");
        return;
    }

    const { scoredUsers, failedUsers } = await scoreUsers(validUsers, config);
    if (scoredUsers.length > 0) {
        exportResults(scoredUsers);
        if (config.storeStatus) {
            storeTrustScores(config.env, scoredUsers);
        }
    } else {
        console.log("⚠️  No users were successfully trust-scored");
    }

    if (failedUsers.length > 0) {
        console.warn(
            `⚠️ Deferred ${failedUsers.length} users because one or more scoring chunks failed. Their trust_score remains NULL and they will retry on the next run.`,
        );
    }
}

const isMain =
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
