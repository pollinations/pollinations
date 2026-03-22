#!/usr/bin/env npx tsx
/**
 * LLM-based trust scoring for the hourly pipeline.
 *
 * Scores microbe users for coordinated abuse patterns using an LLM.
 * GitHub account validation is a separate pre-step handled by the caller.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/scoring/trust-score.ts --store-status
 *   npx tsx user-scoring/scoring/trust-score.ts --emails-file /tmp/emails.txt
 *
 * Options:
 *   --limit N        Max pending users to consider (default: 5000)
 *   --store-status   Write results back to D1
 *   --emails-file    Restrict to emails in a newline-separated file
 *   --trace-file     Append local debugging traces as JSONL
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TIER_POLLEN } from "../../src/tier-config.ts";
import { getNumber, getString, hasFlag } from "../shared/cli.ts";
import { executeD1, getRuntimeEnvironment, queryD1 } from "../shared/d1.ts";
import {
    buildEmailFilter,
    escapeSqlString,
    loadEmailCohort,
} from "../shared/email-cohort.ts";
import { PIPELINE_DB_BATCH_SIZE } from "../shared/github-identity.ts";
import { llmComplete } from "../shared/llm.ts";
import { appendTrace } from "../shared/trace.ts";

const SCORE_WINDOW = 30;
const HOLD_BACK_USERS = 30;
const MAX_WAIT_MINUTES = 90;
const DEFAULT_USER_LIMIT = 5000;
const TRUST_PASS_THRESHOLD = 50;
let promptTemplate: string | null = null;

function getPromptTemplate(): string {
    promptTemplate ??= readFileSync(
        new URL("trust-score-prompt.md", import.meta.url),
        "utf-8",
    );
    return promptTemplate;
}

export interface User {
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

export interface PendingTrustPartition {
    holdbackUsers: User[];
    targetUsers: User[];
    releasedHoldbackUsers: User[];
}

type TrustDecision =
    | "trust_pass"
    | "trust_block"
    | "defer_trust_chunk"
    | "holdback_context";

export const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

export function parseLLMResponse(
    content: string,
    idToIndex: Map<number, number>,
    targetCount: number,
    options?: { strict?: boolean },
): Array<{ score: number; signals: string[] }> {
    const strict = options?.strict ?? false;
    const results: Array<{ score: number; signals: string[] }> = Array.from(
        { length: targetCount },
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

        // Strip bracket prefixes like "[x39] " that some models add
        const cleaned = line.replace(/^\[.*?\]\s*/, "");
        const parts = cleaned.split(",");
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

    if (strict && seen.size < targetCount) {
        throw new Error(
            "LLM response omitted one or more target users from the chunk",
        );
    }

    return results;
}

function normalizeTimestamp(timestamp: number): number {
    return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatDate(timestamp: number): string {
    return new Date(normalizeTimestamp(Number(timestamp)))
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
}

function hasWaitedLongEnough(
    user: User,
    nowMs: number,
    maxWaitMinutes: number = MAX_WAIT_MINUTES,
): boolean {
    return (
        nowMs - normalizeTimestamp(user.created_at) >= maxWaitMinutes * 60_000
    );
}

export function partitionPendingUsers(
    users: User[],
    options?: {
        nowMs?: number;
        holdBackUsers?: number;
        maxWaitMinutes?: number;
    },
): PendingTrustPartition {
    const nowMs = options?.nowMs ?? Date.now();
    const holdBackUsers = options?.holdBackUsers ?? HOLD_BACK_USERS;
    const maxWaitMinutes = options?.maxWaitMinutes ?? MAX_WAIT_MINUTES;
    const holdbackUsers: User[] = [];
    const targetUsers: User[] = [];
    const releasedHoldbackUsers: User[] = [];

    for (const [index, user] of users.entries()) {
        const forcedRelease =
            index < holdBackUsers &&
            hasWaitedLongEnough(user, nowMs, maxWaitMinutes);

        if (index < holdBackUsers && !forcedRelease) {
            holdbackUsers.push(user);
            continue;
        }

        targetUsers.push(user);
        if (forcedRelease) {
            releasedHoldbackUsers.push(user);
        }
    }

    return {
        holdbackUsers,
        targetUsers,
        releasedHoldbackUsers,
    };
}

function prepareChunkData(
    chunk: User[],
    targetUsers: User[],
): {
    csvRows: string[];
    idToIndex: Map<number, number>;
} {
    const idToIndex = new Map<number, number>();
    const targetEmails = new Set(targetUsers.map((user) => user.email));
    const csvRows = chunk.map((user) => {
        if (targetEmails.has(user.email)) {
            idToIndex.set(user.github_id, idToIndex.size);
        }
        return `${user.github_id},${user.github_username ?? ""},${user.email},${formatDate(user.created_at)}`;
    });
    return { csvRows, idToIndex };
}

async function scoreChunk(
    chunk: User[],
    targetUsers: User[],
    apiKey: string,
    options?: {
        traceFile: string | null;
        runId: string;
        windowStart: number;
        windowEnd: number;
        targetEmails: string[];
        newerContextCount: number;
        olderContextCount: number;
    },
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, idToIndex } = prepareChunkData(chunk, targetUsers);
    const prompt = getPromptTemplate() + csvRows.join("\n");

    for (let attempt = 1; attempt <= 3; attempt++) {
        const startedAt = Date.now();
        appendTrace(options?.traceFile ?? null, {
            stage: "trust",
            type: "chunk_attempt",
            run_id: options?.runId ?? null,
            window_start: options?.windowStart ?? null,
            window_end: options?.windowEnd ?? null,
            target_emails: options?.targetEmails ?? [],
            chunk_size: chunk.length,
            target_count: targetUsers.length,
            newer_context_count: options?.newerContextCount ?? null,
            older_context_count: options?.olderContextCount ?? null,
            prompt_chars: prompt.length,
            attempt,
        });
        console.log(
            `   ⏱️  LLM request: ${targetUsers.length} targets, ${chunk.length} total users, ${prompt.length} chars${attempt > 1 ? ` (attempt ${attempt})` : ""}`,
        );
        try {
            const content = await llmComplete(prompt, { apiKey });
            appendTrace(options?.traceFile ?? null, {
                stage: "trust",
                type: "chunk_success",
                run_id: options?.runId ?? null,
                window_start: options?.windowStart ?? null,
                window_end: options?.windowEnd ?? null,
                target_emails: options?.targetEmails ?? [],
                chunk_size: chunk.length,
                target_count: targetUsers.length,
                attempt,
                duration_ms: Date.now() - startedAt,
                response_chars: content.length,
            });
            console.log(
                `   ✅ LLM response in ${Date.now() - startedAt}ms (${content.length} chars)`,
            );
            return parseLLMResponse(content, idToIndex, targetUsers.length);
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
                target_emails: options?.targetEmails ?? [],
                chunk_size: chunk.length,
                target_count: targetUsers.length,
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

function buildExclusionFilter(column: string, emails: string[]): string {
    if (emails.length === 0) return "";
    const values = emails
        .map((email) => `'${escapeSqlString(email)}'`)
        .join(", ");
    return ` AND ${column} NOT IN (${values})`;
}

function fetchNeighborContext(
    direction: "newer" | "older",
    boundaryCreatedAt: number,
    limit: number,
    cohortEmails: string[] | null,
    excludeEmails: string[],
): User[] {
    if (limit <= 0) return [];

    const emailFilter = buildEmailFilter("email", cohortEmails);
    const exclusionFilter = buildExclusionFilter("email", excludeEmails);
    const comparison = direction === "newer" ? ">" : "<";
    const order = direction === "newer" ? "ASC" : "DESC";
    const rows = queryD1(
        `SELECT email, github_id, github_username, created_at, tier FROM user WHERE COALESCE(banned, 0) = 0 AND created_at ${comparison} ${boundaryCreatedAt}${emailFilter}${exclusionFilter} ORDER BY created_at ${order} LIMIT ${limit}`,
    ) as unknown as User[];

    return direction === "newer" ? rows.reverse() : rows;
}

function storeChunkTrustScores(scored: ScoredUser[]): void {
    const batch = scored.slice(0, PIPELINE_DB_BATCH_SIZE);
    if (batch.length === 0) return;

    const cases = batch
        .map((u) => `WHEN '${escapeSqlString(u.email)}' THEN ${100 - u.score}`)
        .join(" ");
    const emailList = batch
        .map((u) => `'${escapeSqlString(u.email)}'`)
        .join(", ");

    if (
        executeD1(
            `UPDATE user SET trust_score = CASE email ${cases} END WHERE email IN (${emailList})`,
        )
    ) {
        console.log(`   💾 Stored ${batch.length} trust scores to D1`);
    } else {
        console.error(`   ❌ Failed to store ${batch.length} trust scores`);
    }

    // Promote trusted users to spore
    const trusted = batch.filter((u) => 100 - u.score >= TRUST_PASS_THRESHOLD);
    if (trusted.length === 0) return;

    const trustedEmailList = trusted
        .map((u) => `'${escapeSqlString(u.email)}'`)
        .join(", ");

    if (
        executeD1(
            `UPDATE user SET tier = 'spore', tier_balance = ${TIER_POLLEN.spore}, last_tier_grant = ${Date.now()} WHERE tier = 'microbe' AND email IN (${trustedEmailList})`,
        )
    ) {
        console.log(`   🍄 Promoted ${trusted.length} trusted users to spore`);
    } else {
        console.error(
            `   ❌ Failed to promote ${trusted.length} users to spore`,
        );
    }
}

async function scoreUsers(
    users: User[],
    cohortEmails: string[] | null,
    traceFile: string | null,
    runId: string,
    storeStatus = false,
): Promise<{ scoredUsers: ScoredUser[]; failedUsers: User[] }> {
    const apiKey = loadApiKey();
    console.log(
        `\n🤖 Scoring ${users.length} target users in ${SCORE_WINDOW}-user groups...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const failedEmails = new Set<string>();

    for (let i = 0; i < users.length; i += SCORE_WINDOW) {
        const group = users.slice(i, Math.min(i + SCORE_WINDOW, users.length));
        const groupEmails = group.map((user) => user.email);
        const newerContext = fetchNeighborContext(
            "newer",
            group[0].created_at,
            SCORE_WINDOW,
            cohortEmails,
            groupEmails,
        );
        const olderContext = fetchNeighborContext(
            "older",
            group[group.length - 1].created_at,
            SCORE_WINDOW,
            cohortEmails,
            groupEmails,
        );
        const chunk = [...newerContext, ...group, ...olderContext];

        console.log(
            `\n⚡ Scoring targets ${i + 1}-${i + group.length} of ${users.length} (chunk size: ${chunk.length}, newer=${newerContext.length}, older=${olderContext.length})`,
        );

        try {
            const scores = await scoreChunk(chunk, group, apiKey, {
                traceFile,
                runId,
                windowStart: i + 1,
                windowEnd: i + group.length,
                targetEmails: groupEmails,
                newerContextCount: newerContext.length,
                olderContextCount: olderContext.length,
            });
            const chunkScored: ScoredUser[] = [];
            for (const [index, user] of group.entries()) {
                allScores.set(user.email, scores[index]);
                failedEmails.delete(user.email);
                chunkScored.push({
                    ...user,
                    score: scores[index].score,
                    signals: scores[index].signals,
                    action: getAction(scores[index].score),
                });
            }
            if (storeStatus && chunkScored.length > 0) {
                storeChunkTrustScores(chunkScored);
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
    return 100 - user.score >= TRUST_PASS_THRESHOLD
        ? "trust_pass"
        : "trust_block";
}

function reconcileTrustDecision(
    decision: TrustDecision,
    state: StoredTrustState | undefined,
): string | null {
    if (!state) return "missing_post_state";

    switch (decision) {
        case "trust_pass":
            return Number(state.trust_score ?? -1) >= TRUST_PASS_THRESHOLD
                ? null
                : `expected_trust_score_gte_${TRUST_PASS_THRESHOLD}`;
        case "trust_block":
            return Number(state.trust_score ?? 101) < TRUST_PASS_THRESHOLD
                ? null
                : `expected_trust_score_lt_${TRUST_PASS_THRESHOLD}`;
        case "defer_trust_chunk":
        case "holdback_context":
            return state.trust_score === null
                ? null
                : "expected_null_trust_score";
    }
}

function fetchPendingUsers(
    limit: number,
    cohortEmails: string[] | null,
): User[] {
    const cohortLabel = cohortEmails
        ? ` from cohort (${cohortEmails.length})`
        : "";
    console.log(`📊 Fetching up to ${limit} pending users${cohortLabel}...`);

    const emailFilter = buildEmailFilter("email", cohortEmails);
    const users = queryD1(
        `SELECT email, github_id, github_username, created_at, tier FROM user WHERE tier = 'microbe' AND COALESCE(banned, 0) = 0 AND trust_score IS NULL ${emailFilter} ORDER BY created_at DESC LIMIT ${limit}`,
    ) as unknown as User[];
    console.log(`✅ Fetched ${users.length} users`);
    return users;
}

function loadApiKey(): string {
    const key = process.env.PLN_GITHUB_USER_SCORE_KEY;
    if (!key) {
        console.error("❌ PLN_GITHUB_USER_SCORE_KEY not set");
        console.error(
            "💡 Run: npm run decrypt-vars (local) or set the GitHub Actions secret (CI)",
        );
        process.exit(1);
    }
    return key.trim();
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const traceFile = getString(args, "--trace-file") ?? null;

    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(getString(args, "--emails-file"));
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        userLimit:
            getNumber(args, "--limit", DEFAULT_USER_LIMIT) ??
            DEFAULT_USER_LIMIT,
        storeStatus: hasFlag(args, "--store-status"),
        cohortEmails,
        traceFile,
    };
}

async function main(): Promise<void> {
    const config = parseArguments();
    const runId = `${Date.now()}-${process.pid}`;
    const env = getRuntimeEnvironment();

    console.log("🚀 New-User Trust Gate");
    console.log("=".repeat(50));
    console.log(
        `📋 env=${env}, limit=${config.userLimit}, store=${config.storeStatus}, cohort=${config.cohortEmails?.length ?? "none"}`,
    );
    if (config.traceFile) {
        console.log(`🧾 Trace file: ${config.traceFile}`);
    }

    const users = fetchPendingUsers(config.userLimit, config.cohortEmails);
    const partition = partitionPendingUsers(users);
    const releasedHoldbackEmails = new Set(
        partition.releasedHoldbackUsers.map((user) => user.email),
    );
    appendTrace(config.traceFile, {
        stage: "trust",
        type: "run_start",
        run_id: runId,
        store_status: config.storeStatus,
        selected_users: users.length,
        holdback_users: partition.holdbackUsers.length,
        target_users: partition.targetUsers.length,
        forced_target_users: partition.releasedHoldbackUsers.length,
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

    console.log(
        `🧭 Holdback=${partition.holdbackUsers.length}, targets=${partition.targetUsers.length}, forced release=${partition.releasedHoldbackUsers.length}`,
    );
    if (partition.targetUsers.length === 0) {
        console.log(
            `⚠️  No target users yet. Holding back ${partition.holdbackUsers.length} newest pending users for future context.`,
        );
        const storedStates = config.storeStatus
            ? fetchStoredTrustStatesByEmail(users.map((user) => user.email))
            : null;
        let anomalies = 0;

        for (const user of partition.holdbackUsers) {
            const state = storedStates?.get(user.email);
            const reconcileIssue =
                config.storeStatus && storedStates
                    ? reconcileTrustDecision("holdback_context", state)
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
                decision: "holdback_context",
                stored: config.storeStatus,
                forced_release: false,
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
            holdback_users: partition.holdbackUsers.length,
            target_users: 0,
            scored_users: 0,
            deferred_users: 0,
            stored_users: 0,
            anomalies,
        });
        return;
    }

    const { scoredUsers, failedUsers } = await scoreUsers(
        partition.targetUsers,
        config.cohortEmails,
        config.traceFile,
        runId,
        config.storeStatus,
    );

    if (scoredUsers.length > 0) {
        exportResults(scoredUsers);
        // Trust scores are now stored incrementally after each chunk.
        // Final bulk store as safety net for any missed scores.
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
            forced_release: releasedHoldbackEmails.has(user.email),
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
            forced_release: releasedHoldbackEmails.has(user.email),
            post_tier: state?.tier ?? null,
            post_trust_score: state?.trust_score ?? null,
            reconcile_issue: reconcileIssue,
        });
    }

    for (const user of partition.holdbackUsers) {
        const state = storedStates?.get(user.email);
        const reconcileIssue =
            config.storeStatus && storedStates
                ? reconcileTrustDecision("holdback_context", state)
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
            decision: "holdback_context",
            stored: config.storeStatus,
            forced_release: false,
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
        holdback_users: partition.holdbackUsers.length,
        target_users: partition.targetUsers.length,
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
