#!/usr/bin/env npx tsx

/**
 * Daily global abuse scan.
 *
 * Report-only v1:
 * - scans unbanned non-microbe users from D1
 * - validates GitHub identities by github_id
 * - builds deterministic suspicious cohorts from D1/session signals
 * - uses the LLM only for suspicious cohorts
 * - emits a CSV report with proposed trust outcomes
 *
 * No trust_score writes, no tier changes, no bans are applied in this version.
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
    buildGlobalAbusePrompt,
    buildSuspiciousCohorts,
    type GlobalAbuseSession,
    type GlobalAbuseUser,
    type SuspiciousCohort,
} from "./scoring/global-abuse-score.ts";
import { parseScoreCsvResponse } from "./scoring/trust-score-helpers.ts";
import { queryD1 } from "./shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "./shared/email-cohort.ts";
import { validateGithubAccounts } from "./shared/github-validation.ts";
import {
    callPollinationsChatModel,
    loadEnterApiToken,
} from "./shared/pollinations-llm.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    userLimit: number | null;
    lookbackDays: number;
    modelName: string;
    reportFile: string;
    cohortEmails: string[] | null;
}

interface ReportEntry {
    cohort_id: string;
    email: string;
    github_id: number | null;
    github_username: string | null;
    tier: string;
    current_trust_score: number | null;
    deterministic_signals: string;
    llm_abuse_score: number | null;
    proposed_trust_score: number | null;
    proposed_action: string;
    notes: string;
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);

    function getStr(flag: string, defaultValue: string): string {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : defaultValue;
    }

    function getNum(flag: string, defaultValue: number): number {
        const value = getStr(flag, "");
        return value ? Number.parseInt(value, 10) : defaultValue;
    }

    const env = getStr("--env", "staging");
    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging and cannot write to production.`,
        );
        process.exit(1);
    }

    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(
            getStr("--emails-file", "") || undefined,
        );
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        env: "staging",
        userLimit: Math.max(0, getNum("--limit", 0)) || null,
        lookbackDays: getNum("--lookback-days", 30),
        modelName: getStr("--model", "gemini"),
        reportFile: getStr("--report-file", "global-abuse-report.csv"),
        cohortEmails,
    };
}

function fetchUsers(
    env: Environment,
    limit: number | null,
    cohortEmails: string[] | null,
): GlobalAbuseUser[] {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const limitClause = limit ? `LIMIT ${limit}` : "";
    return queryD1(
        env,
        `
        SELECT id, email, github_id, github_username, tier, created_at, trust_score
        FROM user
        WHERE COALESCE(banned, 0) = 0
        AND tier != 'microbe'
        ${emailFilter}
        ORDER BY created_at DESC
        ${limitClause}
        `.replace(/\n/g, " "),
    ).flatMap((row) => {
        if (
            typeof row.id !== "string" ||
            typeof row.email !== "string" ||
            typeof row.tier !== "string"
        ) {
            return [];
        }

        const github_id =
            typeof row.github_id === "number" &&
            Number.isInteger(row.github_id) &&
            row.github_id > 0
                ? row.github_id
                : null;
        const github_username =
            typeof row.github_username === "string"
                ? row.github_username
                : null;
        const created_at = Number(row.created_at);
        if (!Number.isFinite(created_at)) return [];

        return [
            {
                id: row.id,
                email: row.email,
                github_id,
                github_username: github_username ?? "",
                tier: row.tier,
                created_at,
                trust_score:
                    typeof row.trust_score === "number" &&
                    Number.isFinite(row.trust_score)
                        ? row.trust_score
                        : null,
            } satisfies GlobalAbuseUser,
        ];
    });
}

function fetchRecentSessions(
    env: Environment,
    lookbackDays: number,
    cohortEmails: string[] | null,
): GlobalAbuseSession[] {
    const cutoff = Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60;
    const emailFilter = buildEmailFilter("u.email", cohortEmails);

    return queryD1(
        env,
        `
        SELECT s.user_id, s.ip_address, s.user_agent, s.created_at
        FROM session s
        JOIN user u ON u.id = s.user_id
        WHERE COALESCE(u.banned, 0) = 0
        AND u.tier != 'microbe'
        AND s.created_at >= ${cutoff}
        AND (s.ip_address IS NOT NULL OR s.user_agent IS NOT NULL)
        ${emailFilter}
        ORDER BY s.created_at DESC
        `.replace(/\n/g, " "),
    ).flatMap((row) => {
        if (typeof row.user_id !== "string") return [];
        const created_at = Number(row.created_at);
        if (!Number.isFinite(created_at)) return [];
        return [
            {
                user_id: row.user_id,
                ip_address:
                    typeof row.ip_address === "string" ? row.ip_address : null,
                user_agent:
                    typeof row.user_agent === "string" ? row.user_agent : null,
                created_at,
            } satisfies GlobalAbuseSession,
        ];
    });
}

function toCsvValue(value: string | number | null): string {
    const normalized = value == null ? "" : String(value);
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

function writeReport(path: string, entries: ReportEntry[]): void {
    const header = [
        "cohort_id",
        "email",
        "github_id",
        "github_username",
        "tier",
        "current_trust_score",
        "deterministic_signals",
        "llm_abuse_score",
        "proposed_trust_score",
        "proposed_action",
        "notes",
    ];
    const lines = [
        header.join(","),
        ...entries.map((entry) =>
            [
                entry.cohort_id,
                entry.email,
                entry.github_id,
                entry.github_username,
                entry.tier,
                entry.current_trust_score,
                entry.deterministic_signals,
                entry.llm_abuse_score,
                entry.proposed_trust_score,
                entry.proposed_action,
                entry.notes,
            ]
                .map(toCsvValue)
                .join(","),
        ),
    ];
    writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
}

function buildValidationEntries(
    users: GlobalAbuseUser[],
    deletedGithubIds: number[],
    missingOrInvalidUsers: GlobalAbuseUser[],
): ReportEntry[] {
    const deletedSet = new Set(deletedGithubIds);
    const deletedEntries = users
        .filter(
            (user) => user.github_id !== null && deletedSet.has(user.github_id),
        )
        .map(
            (user) =>
                ({
                    cohort_id: "identity-check",
                    email: user.email,
                    github_id: user.github_id,
                    github_username: user.github_username,
                    tier: user.tier,
                    current_trust_score: user.trust_score,
                    deterministic_signals: "github_identity_deleted",
                    llm_abuse_score: null,
                    proposed_trust_score: null,
                    proposed_action: "ban_deleted_account",
                    notes: "Detected during github_id validation; report-only mode does not write bans.",
                }) satisfies ReportEntry,
        );

    const missingEntries = missingOrInvalidUsers.map(
        (user) =>
            ({
                cohort_id: "identity-check",
                email: user.email,
                github_id: user.github_id,
                github_username: user.github_username,
                tier: user.tier,
                current_trust_score: user.trust_score,
                deterministic_signals: "github_identity_missing",
                llm_abuse_score: null,
                proposed_trust_score: null,
                proposed_action: "ban_invalid_identity",
                notes: "Missing or invalid github_id; report-only mode does not write bans.",
            }) satisfies ReportEntry,
    );

    return [...deletedEntries, ...missingEntries];
}

async function scoreCohort(
    cohort: SuspiciousCohort,
    apiKey: string,
    modelName: string,
): Promise<ReportEntry[]> {
    const prompt = buildGlobalAbusePrompt(cohort);
    const content = await callPollinationsChatModel(prompt, apiKey, modelName);
    const keyToIndex = new Map(
        cohort.members.map((member, index) => [member.email, index] as const),
    );
    const parsed = parseScoreCsvResponse(
        content,
        keyToIndex,
        cohort.members.length,
        ["email"],
    );

    return cohort.members.map((member, index) => {
        const abuseScore = parsed[index]?.score ?? null;
        const proposedTrustScore =
            abuseScore === null ? null : Math.max(0, 100 - abuseScore);
        return {
            cohort_id: cohort.id,
            email: member.email,
            github_id: member.github_id,
            github_username: member.github_username,
            tier: member.tier,
            current_trust_score: member.trust_score,
            deterministic_signals: member.signal_hits
                .map((hit) => `${hit.type}:${hit.size}`)
                .join("|"),
            llm_abuse_score: abuseScore,
            proposed_trust_score: proposedTrustScore,
            proposed_action:
                proposedTrustScore !== null && proposedTrustScore < 60
                    ? "downgrade_to_microbe"
                    : "keep_current_tier",
            notes:
                parsed[index]?.signals.join("+") ||
                "Suspicious deterministic cohort; no extra LLM flags.",
        } satisfies ReportEntry;
    });
}

async function main(): Promise<void> {
    const config = parseArguments();
    console.log("🚀 Daily Global Abuse Scan");
    console.log("=".repeat(50));
    console.log("📋 Mode: REPORT ONLY");
    console.log(
        `📋 Config: env=${config.env}, limit=${config.userLimit ?? "all"}, lookback=${config.lookbackDays}d, model=${config.modelName}${
            config.cohortEmails
                ? `, email cohort (${config.cohortEmails.length})`
                : ""
        }`,
    );

    const users = fetchUsers(config.env, config.userLimit, config.cohortEmails);
    console.log(`📊 Fetched ${users.length} candidate users`);
    if (users.length === 0) {
        console.log("⚠️  No non-microbe users found");
        writeReport(config.reportFile, []);
        return;
    }

    const validation = validateGithubAccounts(
        users,
        config.env,
        `${import.meta.dirname}/scoring`,
        {
            applyChanges: false,
            missingLabel: "Flag users with missing/invalid GitHub IDs",
            deletedLabel: "Flag users with deleted GitHub accounts",
            syncLabel: "Sync GitHub usernames from GitHub IDs",
        },
    );

    const sessions = fetchRecentSessions(
        config.env,
        config.lookbackDays,
        config.cohortEmails,
    );
    console.log(`📡 Fetched ${sessions.length} recent sessions`);

    const cohorts = buildSuspiciousCohorts(validation.validUsers, sessions);
    console.log(`🧠 Built ${cohorts.length} suspicious cohorts`);

    const reportEntries = buildValidationEntries(
        users,
        validation.deletedGithubIds,
        validation.missingOrInvalidUsers,
    );

    if (cohorts.length === 0) {
        writeReport(config.reportFile, reportEntries);
        console.log(`📝 Wrote report to ${config.reportFile}`);
        return;
    }

    const apiKey = loadEnterApiToken();
    for (const cohort of cohorts) {
        console.log(
            `🤖 Scoring ${cohort.id} (${cohort.members.length} users, ${cohort.signal_summary.join(", ")})`,
        );
        try {
            reportEntries.push(
                ...(await scoreCohort(cohort, apiKey, config.modelName)),
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error(`❌ ${cohort.id} failed: ${message}`);
            for (const member of cohort.members) {
                reportEntries.push({
                    cohort_id: cohort.id,
                    email: member.email,
                    github_id: member.github_id,
                    github_username: member.github_username,
                    tier: member.tier,
                    current_trust_score: member.trust_score,
                    deterministic_signals: member.signal_hits
                        .map((hit) => `${hit.type}:${hit.size}`)
                        .join("|"),
                    llm_abuse_score: null,
                    proposed_trust_score: null,
                    proposed_action: "deferred",
                    notes: message,
                });
            }
        }
    }

    reportEntries.sort((left, right) => {
        const leftScore = left.proposed_trust_score ?? 101;
        const rightScore = right.proposed_trust_score ?? 101;
        return leftScore - rightScore || left.email.localeCompare(right.email);
    });
    writeReport(config.reportFile, reportEntries);
    console.log(`📝 Wrote report to ${config.reportFile}`);
    const wouldDowngrade = reportEntries.filter(
        (entry) => entry.proposed_action === "downgrade_to_microbe",
    ).length;
    console.log(
        `📊 Report summary: ${reportEntries.length} rows, ${wouldDowngrade} proposed microbe downgrades, ${validation.deletedGithubIds.length} deleted GitHub accounts`,
    );
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
