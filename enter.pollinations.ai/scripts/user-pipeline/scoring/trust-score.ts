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
 *   --trace-file     Append local debugging traces as JSONL
 */

import {
    appendFileSync,
    existsSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
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
    traceFile: string | null;
}

interface StoredTrustState {
    email: string;
    trust_score: number | null;
    tier: string | null;
    banned: number | null;
}

type TrustDecision = "trust_pass" | "trust_block" | "defer_trust_chunk";

export const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

function appendTrace(
    traceFile: string | null,
    payload: Record<string, unknown>,
): void {
    if (!traceFile) return;
    appendFileSync(
        traceFile,
        `${JSON.stringify({
            timestamp: new Date().toISOString(),
            ...payload,
        })}\n`,
    );
}

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
        if (
            !line.trim() ||
            line.startsWith("github_id,") ||
            !line.includes(",")
        )
            continue;

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const githubId = Number.parseInt(parts[0]?.trim(), 10);
        const score = Number.parseInt(parts[1], 10);
        const reason = parts[2]?.trim() || "";
        const idx = !Number.isNaN(githubId)
            ? idToIndex.get(githubId)
            : undefined;
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
    options?: {
        traceFile: string | null;
        runId: string;
        windowStart: number;
        windowEnd: number;
        centerEmails: string[];
    },
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, idToIndex } = prepareChunkData(chunk);
    const prompt = PROMPT_TEMPLATE + csvRows.join("\n");

    for (let attempt = 1; attempt <= 3; attempt++) {
        const startedAt = Date.now();
        appendTrace(options?.traceFile ?? null, {
            stage: "trust",
            type: "chunk_attempt",
            run_id: options?.runId ?? null,
            window_start: options?.windowStart ?? null,
            window_end: options?.windowEnd ?? null,
            center_emails: options?.centerEmails ?? [],
            chunk_size: chunk.length,
            prompt_chars: prompt.length,
            attempt,
        });
        console.log(
            `   ⏱️  LLM request: ${chunk.length} users, ${prompt.length} chars${attempt > 1 ? ` (attempt ${attempt})` : ""}`,
        );
        try {
            const content = await llmComplete(prompt, { apiKey });
            appendTrace(options?.traceFile ?? null, {
                stage: "trust",
                type: "chunk_success",
                run_id: options?.runId ?? null,
                window_start: options?.windowStart ?? null,
                window_end: options?.windowEnd ?? null,
                center_emails: options?.centerEmails ?? [],
                chunk_size: chunk.length,
                attempt,
                duration_ms: Date.now() - startedAt,
                response_chars: content.length,
            });
            console.log(
                `   ✅ LLM response in ${Date.now() - startedAt}ms (${content.length} chars)`,
            );
            return parseLLMResponse(content, idToIndex, chunk.length);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : "";
            const errName = err instanceof Error ? err.name : "unknown";
            appendTrace(options?.traceFile ?? null, {
                stage: "trust",
                type: "chunk_failure",
                run_id: options?.runId ?? null,
                window_start: options?.windowStart ?? null,
                window_end: options?.windowEnd ?? null,
                center_emails: options?.centerEmails ?? [],
                chunk_size: chunk.length,
                attempt,
                duration_ms: Date.now() - startedAt,
                error_name: errName,
                message: msg,
            });
            console.warn(
                `   ⚠️  Attempt ${attempt} failed [${errName}]: ${msg}`,
            );
            if (errName !== "AbortError" && stack)
                console.warn(`   Stack: ${stack}`);
            if (attempt >= 3) throw err;
        }
    }
    throw new Error("unreachable");
}

async function scoreUsers(
    users: User[],
    traceFile: string | null,
    runId: string,
): Promise<{ scoredUsers: ScoredUser[]; failedUsers: User[] }> {
    const apiKey = loadApiKey();
    console.log(
        `\n🤖 Scoring ${users.length} users in chunks of ${CHUNK_SIZE}...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const failedEmails = new Set<string>();

    for (let i = 0; i < users.length; i += SCORE_WINDOW) {
        const before = users.slice(Math.max(0, i - SCORE_WINDOW), i);
        const group = users.slice(i, Math.min(i + SCORE_WINDOW, users.length));
        const after = users.slice(
            i + SCORE_WINDOW,
            Math.min(i + SCORE_WINDOW * 2, users.length),
        );
        const chunk = [...before, ...group, ...after];
        const startIdx = before.length;

        console.log(
            `\n⚡ Scoring users ${i + 1}-${i + group.length} of ${users.length} (chunk size: ${chunk.length})`,
        );

        try {
            const scores = await scoreChunk(chunk, apiKey, {
                traceFile,
                runId,
                windowStart: i + 1,
                windowEnd: i + group.length,
                centerEmails: group.map((user) => user.email),
            });
            for (
                let j = startIdx;
                j < startIdx + group.length && j < scores.length;
                j++
            ) {
                allScores.set(chunk[j].email, scores[j]);
                failedEmails.delete(chunk[j].email);
            }
        } catch (error) {
            console.error(
                `   ❌ Chunk failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            for (const user of group) failedEmails.add(user.email);
        }

        // Running tally after each chunk
        const tally = { block: 0, review: 0, ok: 0 };
        for (const s of allScores.values()) {
            tally[getAction(s.score)]++;
        }
        const scored = allScores.size;
        const deferred = failedEmails.size;
        const remaining =
            users.length - (i + Math.min(SCORE_WINDOW, users.length - i));
        console.log(
            `   📈 Progress: ${scored} scored, ${deferred} deferred, ${remaining} remaining | block:${tally.block} review:${tally.review} ok:${tally.ok}`,
        );
        appendTrace(traceFile, {
            stage: "trust",
            type: "chunk_progress",
            run_id: runId,
            window_start: i + 1,
            window_end: i + group.length,
            scored,
            deferred,
            remaining,
            tally,
        });
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
    const failedUsers = users.filter((u) => failedEmails.has(u.email));

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
            .map(
                (u) =>
                    `WHEN '${escapeSqlString(u.email)}' THEN ${100 - u.score}`,
            )
            .join(" ");
        const emailList = batch
            .map((u) => `'${escapeSqlString(u.email)}'`)
            .join(", ");

        if (
            executeD1(
                ENV,
                `UPDATE user SET trust_score = CASE email ${cases} END WHERE email IN (${emailList})`,
            )
        ) {
            stored += batch.length;
        }
        console.log(
            `   📊 ${Math.min(i + PIPELINE_DB_BATCH_SIZE, scored.length)}/${scored.length} stored`,
        );
    }

    const passed = scored.filter((u) => 100 - u.score >= 60).length;
    const failed = scored.filter((u) => 100 - u.score < 60).length;
    console.log(
        `✅ Stored ${stored} trust scores (${passed} passed, ${failed} failed)`,
    );
}

function fetchStoredTrustStatesByEmail(
    emails: string[],
): Map<string, StoredTrustState> {
    const states = new Map<string, StoredTrustState>();
    const uniqueEmails = Array.from(new Set(emails));

    for (
        let index = 0;
        index < uniqueEmails.length;
        index += PIPELINE_DB_BATCH_SIZE
    ) {
        const batch = uniqueEmails.slice(index, index + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const rows = queryD1(
            ENV,
            `SELECT email, trust_score, tier, COALESCE(banned, 0) AS banned FROM user WHERE email IN (${batch
                .map((email) => `'${escapeSqlString(email)}'`)
                .join(", ")})`,
        ) as StoredTrustState[];

        for (const row of rows) {
            states.set(row.email, row);
        }
    }

    return states;
}

function classifyTrustDecision(user: ScoredUser): TrustDecision {
    return 100 - user.score >= 60 ? "trust_pass" : "trust_block";
}

function reconcileTrustDecision(
    decision: TrustDecision,
    state: StoredTrustState | undefined,
): string | null {
    if (!state) return "missing_post_state";

    switch (decision) {
        case "trust_pass":
            return Number(state.trust_score ?? -1) >= 60
                ? null
                : "expected_trust_score_gte_60";
        case "trust_block":
            return Number(state.trust_score ?? 101) < 60
                ? null
                : "expected_trust_score_lt_60";
        case "defer_trust_chunk":
            return state.trust_score === null
                ? null
                : "expected_null_trust_score";
    }
}

function fetchUsers(limit: number, cohortEmails: string[] | null): User[] {
    const cohortLabel = cohortEmails
        ? ` from cohort (${cohortEmails.length})`
        : "";
    console.log(
        `📊 Fetching up to ${limit} unprocessed users${cohortLabel}...`,
    );

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
        console.error(
            "💡 Create one with: echo 'ENTER_API_TOKEN_REMOTE=sk_...' > .testingtokens",
        );
        process.exit(1);
    }
    const match = readFileSync(tokenFile, "utf-8").match(
        /ENTER_API_TOKEN_REMOTE=([^\n]+)/,
    );
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
    const traceFile = getStr("--trace-file", "") || null;
    try {
        cohortEmails = loadEmailCohort(emailsFile || undefined);
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        userLimit: getNum("--limit", 5000),
        storeStatus: args.includes("--store-status"),
        cohortEmails,
        traceFile,
    };
}

async function main(): Promise<void> {
    const config = parseArguments();
    const runId = `${Date.now()}-${process.pid}`;

    console.log("🚀 New-User Trust Gate");
    console.log("=".repeat(50));
    console.log(
        `📋 env=${ENV}, limit=${config.userLimit}, store=${config.storeStatus}, cohort=${config.cohortEmails?.length ?? "none"}`,
    );
    if (config.traceFile) {
        console.log(`🧾 Trace file: ${config.traceFile}`);
    }

    const users = fetchUsers(config.userLimit, config.cohortEmails);
    appendTrace(config.traceFile, {
        stage: "trust",
        type: "run_start",
        run_id: runId,
        store_status: config.storeStatus,
        selected_users: users.length,
        cohort_size: config.cohortEmails?.length ?? null,
    });
    if (users.length === 0) {
        console.log("⚠️  No users found");
        appendTrace(config.traceFile, {
            stage: "trust",
            type: "run_end",
            run_id: runId,
            selected_users: 0,
            scored_users: 0,
            deferred_users: 0,
            stored_users: 0,
            anomalies: 0,
        });
        return;
    }

    const { scoredUsers, failedUsers } = await scoreUsers(
        users,
        config.traceFile,
        runId,
    );

    if (scoredUsers.length > 0) {
        exportResults(scoredUsers);
        if (config.storeStatus) storeTrustScores(scoredUsers);
    } else {
        console.log("⚠️  No users were successfully trust-scored");
    }

    if (failedUsers.length > 0) {
        console.warn(
            `⚠️ Deferred ${failedUsers.length} users — will retry on next run.`,
        );
    }

    const storedStates = config.storeStatus
        ? fetchStoredTrustStatesByEmail(users.map((user) => user.email))
        : null;
    let anomalies = 0;

    for (const user of scoredUsers) {
        const trustScore = 100 - user.score;
        const decision = classifyTrustDecision(user);
        const state = storedStates?.get(user.email);
        const reconcileIssue =
            config.storeStatus && storedStates
                ? reconcileTrustDecision(decision, state)
                : null;
        if (reconcileIssue) anomalies += 1;
        appendTrace(config.traceFile, {
            stage: "trust",
            type: "user_decision",
            run_id: runId,
            email: user.email,
            github_id: user.github_id,
            abuse_score: user.score,
            trust_score: trustScore,
            action: user.action,
            signals: user.signals,
            decision,
            stored: config.storeStatus,
            post_tier: state?.tier ?? null,
            post_trust_score: state?.trust_score ?? null,
            reconcile_issue: reconcileIssue,
        });
    }

    for (const user of failedUsers) {
        const state = storedStates?.get(user.email);
        const reconcileIssue =
            config.storeStatus && storedStates
                ? reconcileTrustDecision("defer_trust_chunk", state)
                : null;
        if (reconcileIssue) anomalies += 1;
        appendTrace(config.traceFile, {
            stage: "trust",
            type: "user_decision",
            run_id: runId,
            email: user.email,
            github_id: user.github_id,
            abuse_score: null,
            trust_score: null,
            action: null,
            signals: [],
            decision: "defer_trust_chunk",
            stored: config.storeStatus,
            post_tier: state?.tier ?? null,
            post_trust_score: state?.trust_score ?? null,
            reconcile_issue: reconcileIssue,
        });
    }

    appendTrace(config.traceFile, {
        stage: "trust",
        type: "run_end",
        run_id: runId,
        selected_users: users.length,
        scored_users: scoredUsers.length,
        deferred_users: failedUsers.length,
        stored_users: config.storeStatus ? scoredUsers.length : 0,
        anomalies,
    });
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
