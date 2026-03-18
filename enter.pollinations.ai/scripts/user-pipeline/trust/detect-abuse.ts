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
 *   npx tsx scripts/user-pipeline/trust/detect-abuse.ts --store-status
 *   npx tsx scripts/user-pipeline/trust/detect-abuse.ts --emails-file /tmp/replay-emails.txt
 *   npx tsx scripts/user-pipeline/trust/detect-abuse.ts --single-chunk
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

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

const DB_BATCH_SIZE = 200;
const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;
const OVERLAP_SIZE = 20;

type Environment = "staging";

interface User {
    email: string;
    github_username: string | null;
    created_at: number;
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

interface GithubValidationResult {
    username?: string;
    status?: string;
}

interface ScoreUsersResult {
    scoredUsers: ScoredUser[];
    failedUsers: User[];
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

    const chunkSize = getNum("--chunk-size", 100);
    if (chunkSize <= OVERLAP_SIZE) {
        console.error(
            `Invalid --chunk-size ${chunkSize}. It must be greater than the overlap size (${OVERLAP_SIZE}).`,
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

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
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
    const query = `
        SELECT email, github_username, created_at
        FROM user
        WHERE COALESCE(banned, 0) = 0
        AND trust_score IS NULL
        ${emailFilter}
        ORDER BY created_at DESC
        LIMIT ${limit}
    `.replace(/\n/g, " ");

    const result = execSync(
        `npx wrangler d1 execute DB --remote --env ${env} --json --command "${query}"`,
        { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
    );
    const data = JSON.parse(result);
    const users = data[0]?.results || [];
    console.log(`✅ Fetched ${users.length} users`);
    return users;
}

function formatDate(timestamp: number): string {
    const d = new Date(Number(timestamp));
    return d.toISOString().slice(0, 16).replace("T", " ");
}

function executeD1(env: Environment, sql: string): boolean {
    try {
        execSync(
            `npx wrangler d1 execute DB --remote --env ${env} --command "${sql}"`,
            {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
                maxBuffer: 20 * 1024 * 1024,
            },
        );
        return true;
    } catch (error) {
        console.error(
            "❌ D1 mutation failed:",
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

function banUsersByEmails(env: Environment, emails: string[]): number {
    const uniqueEmails = Array.from(new Set(emails));
    let banned = 0;

    for (let i = 0; i < uniqueEmails.length; i += DB_BATCH_SIZE) {
        const batch = uniqueEmails.slice(i, i + DB_BATCH_SIZE);
        if (batch.length === 0) continue;
        const emailList = batch
            .map((email) => `'${escapeSqlString(email)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE email IN (${emailList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

function banUsersByGithubUsernames(
    env: Environment,
    usernames: string[],
): number {
    const uniqueUsernames = Array.from(new Set(usernames));
    let banned = 0;

    for (let i = 0; i < uniqueUsernames.length; i += DB_BATCH_SIZE) {
        const batch = uniqueUsernames.slice(i, i + DB_BATCH_SIZE);
        if (batch.length === 0) continue;
        const usernameList = batch
            .map((username) => `'${escapeSqlString(username)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE github_username IN (${usernameList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

function runGithubValidation(usernames: string[]): GithubValidationResult[] {
    if (usernames.length === 0) return [];

    const scriptPath = `${import.meta.dirname}/../github`;
    const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptPath}")
from score_users import validate_accounts
results = validate_accounts(${JSON.stringify(usernames)})
print(json.dumps(results))
`;

    const output = execSync(
        `python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`,
        { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
    );

    return JSON.parse(output.trim()) as GithubValidationResult[];
}

function validateGithubAccounts(
    users: User[],
    env: Environment,
    applyChanges: boolean,
): User[] {
    if (users.length === 0) return [];

    const missingOrInvalidUsers = users.filter(
        (user) =>
            typeof user.github_username !== "string" ||
            !GITHUB_USERNAME_RE.test(user.github_username),
    );
    const usersWithGithub = users.filter(
        (user): user is User & { github_username: string } =>
            typeof user.github_username === "string" &&
            GITHUB_USERNAME_RE.test(user.github_username),
    );

    if (missingOrInvalidUsers.length > 0) {
        if (applyChanges) {
            const banned = banUsersByEmails(
                env,
                missingOrInvalidUsers.map((user) => user.email),
            );
            console.log(
                `🚫 Banned ${banned} new users with missing/invalid GitHub usernames`,
            );
        } else {
            console.log(
                `🚫 Detected ${missingOrInvalidUsers.length} users with missing/invalid GitHub usernames`,
            );
        }
    }

    if (usersWithGithub.length === 0) {
        return [];
    }

    const results = runGithubValidation(
        usersWithGithub.map((user) => user.github_username),
    );
    const deletedUsernames = Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === GITHUB_ACCOUNT_DELETED_REASON &&
                typeof result.username === "string"
                    ? [result.username]
                    : [],
            ),
        ),
    );

    if (deletedUsernames.length > 0) {
        if (applyChanges) {
            const banned = banUsersByGithubUsernames(env, deletedUsernames);
            console.log(
                `🚫 Banned ${banned} new users with deleted GitHub accounts`,
            );
        } else {
            console.log(
                `🚫 Detected ${deletedUsernames.length} users with deleted GitHub accounts`,
            );
        }
    }

    const deletedSet = new Set(deletedUsernames);
    return usersWithGithub.filter(
        (user) => !deletedSet.has(user.github_username),
    );
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
        const github = user.github_username || `user_${idx}`;
        const humanDate = formatDate(user.created_at);
        githubToIndex.set(github, idx);
        return `${github},${user.email},${humanDate}`;
    });

    return { csvRows, githubToIndex };
}

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
IMPORTANT: cluster+burst alone = 90 (block). Add rand/disp for extra confidence.
Score 0 for users with normal emails AND normal usernames.

Output CSV: github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Use + to combine. Empty if clean. Focus on GROUPS, not individuals.

Data (github,email,registered):
${csvRows.join("\n")}`;
}

function parseLLMResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
): Array<{ score: number; signals: string[] }> {
    const results: Array<{ score: number; signals: string[] } | null> =
        Array.from({ length: chunkLength }, () => null);

    for (const line of content.split("\n")) {
        if (!line.trim() || line.startsWith("github,") || !line.includes(",")) {
            continue;
        }

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const github = parts[0]?.trim();
        const score = parseInt(parts[1], 10);
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
    }

    if (results.some((result) => result === null)) {
        throw new Error(
            "LLM response omitted one or more users from the chunk",
        );
    }

    return results as Array<{ score: number; signals: string[] }>;
}

async function callScoringAPI(
    chunk: User[],
    apiKey: string,
    modelName: string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, githubToIndex } = prepareChunkData(chunk);
    const prompt = buildScoringPrompt(csvRows);

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
        throw new Error(`LLM API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return parseLLMResponse(content, githubToIndex, chunk.length);
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
        "action,score,email,github_username,signals,registered",
        ...sorted.map(
            (user) =>
                `"${user.action}",${user.score},"${user.email}","${user.github_username || ""}","${user.signals.join("; ")}","${formatDate(user.created_at)}"`,
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

    for (let i = 0; i < scored.length; i += DB_BATCH_SIZE) {
        const batch = scored.slice(i, i + DB_BATCH_SIZE);
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
            `   📊 ${Math.min(i + DB_BATCH_SIZE, scored.length)}/${scored.length} trust scores stored`,
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

    const validUsers = validateGithubAccounts(
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
        console.error(
            `❌ Deferred ${failedUsers.length} users because one or more scoring chunks failed. Their trust_score remains NULL and they will retry on the next run.`,
        );
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
