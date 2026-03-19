#!/usr/bin/env npx tsx
/**
 * New-user trust scoring for the hourly pipeline.
 * Validates GitHub accounts, bans deleted ones, then runs LLM abuse detection.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --store-status
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --emails-file /tmp/replay-emails.txt
 *   npx tsx scripts/user-pipeline/scoring/trust-score.ts --single-chunk
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
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
} from "../shared/github-identity.ts";
import { runInlinePython } from "../shared/python.ts";
import { parseLLMResponse, SCORE_THRESHOLDS } from "./trust-score-helpers.ts";

const OVERLAP_SIZE = 20;

interface User {
    email: string;
    github_id: number | null;
    github_username: string | null;
    created_at: number;
}

interface ScoredUser extends User {
    score: number;
    signals: string[];
    action: "block" | "review" | "ok";
}

interface Config {
    userLimit: number;
    chunkSize: number;
    modelName: string;
    parallelism: number;
    singleChunk: boolean;
    storeStatus: boolean;
    cohortEmails: string[] | null;
}

function parseArguments(): Config {
    const args = process.argv.slice(2);

    function flag(name: string, fallback: string): string {
        const i = args.indexOf(name);
        return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
    }

    function num(name: string, fallback: number): number {
        const v = flag(name, "");
        return v ? parseInt(v, 10) : fallback;
    }

    const chunkSize = num("--chunk-size", 100);
    if (chunkSize <= OVERLAP_SIZE) {
        console.error(
            `Invalid --chunk-size ${chunkSize}. Must be > ${OVERLAP_SIZE}.`,
        );
        process.exit(1);
    }

    const emailsFile = flag("--emails-file", "");
    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(emailsFile || undefined);
    } catch (error) {
        console.error(
            `Failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        userLimit: num("--limit", 5000),
        chunkSize,
        modelName: flag("--model", "gemini"),
        parallelism: num("--parallel", 1),
        singleChunk: args.includes("--single-chunk"),
        storeStatus: args.includes("--store-status"),
        cohortEmails,
    };
}

function loadApiKey(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        console.error("No .testingtokens file found");
        process.exit(1);
    }
    const match = readFileSync(tokenFile, "utf-8").match(
        /ENTER_API_TOKEN_REMOTE=([^\n]+)/,
    );
    if (!match) {
        console.error("No ENTER_API_TOKEN_REMOTE found in .testingtokens");
        process.exit(1);
    }
    return match[1].trim();
}

function fetchUsers(limit: number, cohortEmails: string[] | null): User[] {
    const label = cohortEmails ? ` from cohort (${cohortEmails.length})` : "";
    console.log(`Fetching ${limit} unprocessed users${label}...`);

    const emailFilter = buildEmailFilter("email", cohortEmails);
    const users = queryD1(
        "staging",
        `
        SELECT email, github_id, github_username, created_at
        FROM user
        WHERE COALESCE(banned, 0) = 0
        AND trust_score IS NULL
        ${emailFilter}
        ORDER BY created_at DESC
        LIMIT ${limit}
    `.replace(/\n/g, " "),
    );

    console.log(`Fetched ${users.length} users`);
    return users;
}

function formatDate(timestamp: number): string {
    return new Date(Number(timestamp))
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
}

function syncGithubUsernames(
    users: Array<{ github_id: number; github_username: string }>,
): number {
    const unique = Array.from(
        new Map(
            users
                .filter(
                    (u) =>
                        Number.isInteger(u.github_id) &&
                        u.github_id > 0 &&
                        typeof u.github_username === "string" &&
                        GITHUB_USERNAME_RE.test(u.github_username),
                )
                .map((u) => [u.github_id, u]),
        ).values(),
    );
    let updated = 0;

    for (let i = 0; i < unique.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = unique.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const cases = batch
            .map(
                ({ github_id, github_username }) =>
                    `WHEN ${github_id} THEN '${escapeSqlString(github_username)}'`,
            )
            .join(" ");
        const ids = batch.map(({ github_id }) => github_id).join(", ");
        if (
            executeD1(
                "staging",
                `UPDATE user SET github_username = CASE github_id ${cases} END WHERE github_id IN (${ids})`,
            )
        )
            updated += batch.length;
    }
    return updated;
}

function validateGithubAccounts(users: User[], applyChanges: boolean): User[] {
    if (users.length === 0) return [];

    const hasGithub = (u: User): u is User & { github_id: number } =>
        Number.isInteger(u.github_id) && u.github_id !== null;

    const usersWithGithub = users.filter(hasGithub);
    const missingGithubUsers = users.filter((u) => !hasGithub(u));

    if (missingGithubUsers.length > 0) {
        if (applyChanges) {
            const banned = banUsersByEmails(
                "staging",
                missingGithubUsers.map((u) => u.email),
            );
            console.log(
                `Banned ${banned} users with missing/invalid GitHub IDs`,
            );
        } else {
            console.log(
                `Detected ${missingGithubUsers.length} users with missing/invalid GitHub IDs`,
            );
        }
    }

    if (usersWithGithub.length === 0) return [];

    // Run Python GitHub validation
    const scriptPath = import.meta.dirname;
    const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptPath}")
from github_score import validate_account_records
results = validate_account_records(${JSON.stringify(usersWithGithub)})
print(json.dumps(results))
`;
    const results: Array<{
        github_id?: number | null;
        username?: string;
        status?: string;
    }> = JSON.parse(runInlinePython(pythonScript).trim());

    const deletedIds = new Set<number>();
    const resolved: Array<{ github_id: number; github_username: string }> = [];
    const resultMap = new Map<number, (typeof results)[number]>();

    for (const r of results) {
        if (!Number.isInteger(r.github_id)) continue;
        resultMap.set(r.github_id!, r);
        if (r.status === GITHUB_ACCOUNT_DELETED_REASON)
            deletedIds.add(r.github_id!);
        if (
            typeof r.username === "string" &&
            GITHUB_USERNAME_RE.test(r.username)
        ) {
            resolved.push({
                github_id: r.github_id!,
                github_username: r.username,
            });
        }
    }

    if (resolved.length > 0 && applyChanges) {
        const updated = syncGithubUsernames(resolved);
        if (updated > 0)
            console.log(`Synced ${updated} GitHub usernames from IDs`);
    }

    if (deletedIds.size > 0) {
        if (applyChanges) {
            const banned = banUsersByGithubIds(
                "staging",
                Array.from(deletedIds),
            );
            console.log(`Banned ${banned} users with deleted GitHub accounts`);
        } else {
            console.log(
                `Detected ${deletedIds.size} users with deleted GitHub accounts`,
            );
        }
    }

    return usersWithGithub.flatMap((user) => {
        if (deletedIds.has(user.github_id)) return [];

        const r = resultMap.get(user.github_id);
        const username =
            typeof r?.username === "string" &&
            GITHUB_USERNAME_RE.test(r.username)
                ? r.username
                : user.github_username;

        if (typeof username !== "string" || !GITHUB_USERNAME_RE.test(username))
            return [];
        return [{ ...user, github_username: username }];
    });
}

const SCORING_PROMPT_TEMPLATE = `Detect coordinated abuse by analyzing PATTERNS ACROSS MULTIPLE USERS. Score 0-100.

FOCUS: Cross-user patterns are the strongest signals:
- Common prefixes/suffixes shared by multiple users (e.g., "john_dev1", "john_dev2")
- Similar username structures (e.g., "xxxabc123", "xxxdef456")
- Same email domain clusters (especially obscure domains)
- Burst registrations within same time window
- GitHub usernames with sequential numbers or shared base names

SIGNALS (use these codes):
cluster=3+ users share pattern (+50) - HIGHEST PRIORITY
burst=5+ registrations close together (+40)
rand=random/gibberish email username (+10) - only matters in groups
disp=disposable/temp email domain (+20)
cluster+burst alone = 90 (block). Score 0 for normal emails AND normal usernames.

Output CSV: github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Use + to combine. Empty if clean. Focus on GROUPS, not individuals.

Data (github,email,registered):
`;

async function callScoringAPI(
    chunk: User[],
    apiKey: string,
    modelName: string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const githubToIndex = new Map<string, number>();
    const csvRows = chunk.map((user, idx) => {
        const github = user.github_username || `user_${idx}`;
        githubToIndex.set(github, idx);
        return `${github},${user.email},${formatDate(user.created_at)}`;
    });

    const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: "user",
                        content: SCORING_PROMPT_TEMPLATE + csvRows.join("\n"),
                    },
                ],
                temperature: 0.1,
            }),
        },
    );

    if (!response.ok)
        throw new Error(`LLM API returned HTTP ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return parseLLMResponse(content, githubToIndex, chunk.length);
}

function getAction(score: number): "block" | "review" | "ok" {
    if (score >= SCORE_THRESHOLDS.block) return "block";
    if (score >= SCORE_THRESHOLDS.review) return "review";
    return "ok";
}

async function scoreUsers(
    users: User[],
    config: Config,
): Promise<{ scoredUsers: ScoredUser[]; failedUsers: User[] }> {
    const apiKey = loadApiKey();
    const mode =
        config.parallelism > 1
            ? `${config.parallelism} parallel`
            : "sequential";
    console.log(
        `\nScoring ${users.length} users (chunks of ${config.chunkSize}, ${mode})...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const failedEmails = new Set<string>();

    // Build chunk ranges inline
    const step = config.chunkSize - OVERLAP_SIZE;
    const ranges: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < users.length; i += step) {
        ranges.push({
            start: i,
            end: Math.min(i + config.chunkSize, users.length),
        });
        if (config.singleChunk) break;
    }

    const totalBatches = Math.ceil(ranges.length / config.parallelism);

    for (
        let batchStart = 0;
        batchStart < ranges.length;
        batchStart += config.parallelism
    ) {
        const batch = ranges.slice(batchStart, batchStart + config.parallelism);
        const batchIndex = Math.floor(batchStart / config.parallelism) + 1;
        console.log(
            `\nBatch ${batchIndex}/${totalBatches} (${batch.length} chunks)...`,
        );

        const results = await Promise.all(
            batch.map(async (range) => {
                const chunk = users.slice(range.start, range.end);
                try {
                    return {
                        chunk,
                        scores: await callScoringAPI(
                            chunk,
                            apiKey,
                            config.modelName,
                        ),
                    };
                } catch (error) {
                    console.error(
                        `  Chunk ${range.start + 1}-${range.end} failed: ${error instanceof Error ? error.message : error}`,
                    );
                    return { chunk, scores: null };
                }
            }),
        );

        for (const { chunk, scores } of results) {
            if (!scores) {
                for (const user of chunk) failedEmails.add(user.email);
                continue;
            }
            for (let j = 0; j < chunk.length && j < scores.length; j++) {
                const existing = allScores.get(chunk[j].email);
                if (!existing || scores[j].score > existing.score) {
                    allScores.set(chunk[j].email, scores[j]);
                }
            }
        }

        let block = 0,
            review = 0,
            ok = 0;
        for (const { score } of allScores.values()) {
            if (score >= SCORE_THRESHOLDS.block) block++;
            else if (score >= SCORE_THRESHOLDS.review) review++;
            else ok++;
        }
        console.log(
            `  Progress: ${allScores.size} scored, ${failedEmails.size} failed | block: ${block} | review: ${review} | ok: ${ok}`,
        );
    }

    const scoredUsers = users.flatMap((user) => {
        const s = allScores.get(user.email);
        if (!s) return [];
        return [
            {
                ...user,
                score: s.score,
                signals: s.signals,
                action: getAction(s.score),
            } satisfies ScoredUser,
        ];
    });

    const failedUsers = users.filter((u) => failedEmails.has(u.email));
    console.log(
        `\nScoring complete: ${scoredUsers.length} scored, ${failedUsers.length} deferred`,
    );
    return { scoredUsers, failedUsers };
}

function exportResults(users: ScoredUser[]): void {
    const sorted = [...users].sort((a, b) => b.score - a.score);
    const csv = [
        "action,score,email,github_username,signals,registered",
        ...sorted.map(
            (u) =>
                `"${u.action}",${u.score},"${u.email}","${u.github_username || ""}","${u.signals.join("; ")}","${formatDate(u.created_at)}"`,
        ),
    ].join("\n");

    writeFileSync("abuse-report.csv", csv);
    console.log("\nResults: abuse-report.csv");

    const counts = { block: 0, review: 0, ok: 0 };
    for (const u of sorted) counts[u.action]++;
    console.log(
        `Summary: block(>=${SCORE_THRESHOLDS.block}): ${counts.block} | review(>=${SCORE_THRESHOLDS.review}): ${counts.review} | ok: ${counts.ok}`,
    );
}

function storeTrustScores(scored: ScoredUser[]): void {
    console.log("\nStoring trust scores in D1...");
    let stored = 0;

    for (let i = 0; i < scored.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = scored.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const cases = batch
            .map(
                (u) =>
                    `WHEN '${escapeSqlString(u.email)}' THEN ${100 - u.score}`,
            )
            .join(" ");
        const emails = batch
            .map((u) => `'${escapeSqlString(u.email)}'`)
            .join(", ");

        if (
            executeD1(
                "staging",
                `UPDATE user SET trust_score = CASE email ${cases} END WHERE email IN (${emails})`,
            )
        )
            stored += batch.length;

        console.log(
            `  ${Math.min(i + PIPELINE_DB_BATCH_SIZE, scored.length)}/${scored.length} trust scores stored`,
        );
    }

    const passed = scored.filter((u) => 100 - u.score >= 60).length;
    console.log(
        `Stored ${stored} trust scores (${passed} passed, ${scored.length - passed} failed)`,
    );
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("New-User Trust Gate");
    console.log("=".repeat(50));
    console.log(
        `Config: env=staging, ${config.userLimit} users, chunks=${config.chunkSize}, model=${config.modelName}` +
            (config.storeStatus ? ", store-status" : "") +
            (config.cohortEmails
                ? `, cohort(${config.cohortEmails.length})`
                : ""),
    );

    const fetchedUsers = fetchUsers(config.userLimit, config.cohortEmails);
    if (fetchedUsers.length === 0) {
        console.log("No users found");
        return;
    }

    const validUsers = validateGithubAccounts(fetchedUsers, config.storeStatus);
    if (validUsers.length === 0) {
        console.log("No valid new users left for trust scoring");
        return;
    }

    const { scoredUsers, failedUsers } = await scoreUsers(validUsers, config);
    if (scoredUsers.length > 0) {
        exportResults(scoredUsers);
        if (config.storeStatus) storeTrustScores(scoredUsers);
    } else {
        console.log("No users were successfully trust-scored");
    }

    if (failedUsers.length > 0) {
        console.error(
            `Deferred ${failedUsers.length} users (scoring chunks failed). They will retry next run.`,
        );
        process.exit(1);
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
