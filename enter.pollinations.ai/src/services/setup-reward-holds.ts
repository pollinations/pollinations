import { getLogger } from "@logtape/logtape";
import { setupRewardDecision } from "@shared/db/better-auth.ts";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Env } from "../env.ts";
import type { QuestDb } from "./quests/types.ts";

const log = getLogger(["enter", "setup-reward-holds"]);

/** Other accounts on one network or private domain in 24 hours before holds. */
const SETUP_REWARD_LIMIT = 30;
const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_SECONDS = 30 * DAY_SECONDS;
const CLEANUP_BATCH_SIZE = 100;
/** Accounts in 24 hours on one network or domain that each post to Discord once. */
const REPORT_MILESTONES = [SETUP_REWARD_LIMIT, 100, 1000];

/** A new account that crossed the limit. */
export type SetupRewardCandidate = {
    reason: "network" | "domain";
    key: string;
};

/** Shared mail providers are never counted by domain. */
const PUBLIC_MAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "yahoo.com",
    "ymail.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "gmx.com",
    "gmx.de",
    "web.de",
    "yandex.ru",
    "yandex.com",
    "mail.ru",
    "qq.com",
    "163.com",
    "126.com",
    "naver.com",
    "zoho.com",
]);

/**
 * Writes the account's decision at its first setup reward. Counting, deciding
 * and inserting is one statement, and D1 runs one statement at a time, so
 * concurrent requests can't pass the limit and retries keep the first row.
 * The same batch handles rows older than 30 days: a deleted account's row is
 * removed, a live account's keeps only its decision. Returns the new row's
 * reason when the account crossed the limit.
 */
export async function recordSetupRewardDecision(
    d1: D1Database,
    {
        userId,
        email,
        network,
        holds,
    }: {
        userId: string;
        email: string;
        network: string | undefined;
        holds: boolean;
    },
): Promise<SetupRewardCandidate | null> {
    const now = Math.floor(Date.now() / 1000);
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    const countedDomain = PUBLIC_MAIL_DOMAINS.has(domain) ? null : domain;
    const expired = (accountExists: boolean) =>
        `SELECT user_id FROM setup_reward_decision
        WHERE email_domain IS NOT NULL AND first_reward_at < ?1
            AND ${accountExists ? "" : "NOT "}EXISTS (
                SELECT 1 FROM user WHERE user.id = setup_reward_decision.user_id
            )
        ORDER BY first_reward_at
        LIMIT ${CLEANUP_BATCH_SIZE}`;
    const [inserted] = await d1.batch<{
        candidate_reason: SetupRewardCandidate["reason"] | null;
        network: string | null;
    }>([
        d1
            .prepare(
                `INSERT INTO setup_reward_decision
                    (user_id, network, email_domain, first_reward_at, candidate_reason, held_reason)
                SELECT ?1, ?2, ?3, ?4, reason, CASE WHEN ?5 THEN reason END
                FROM (SELECT CASE
                    WHEN (SELECT COUNT(*) FROM setup_reward_decision
                        WHERE network = ?2 AND first_reward_at > ?4 - ${DAY_SECONDS}
                    ) >= ${SETUP_REWARD_LIMIT} THEN 'network'
                    WHEN (SELECT COUNT(*) FROM setup_reward_decision
                        WHERE email_domain = ?6 AND first_reward_at > ?4 - ${DAY_SECONDS}
                    ) >= ${SETUP_REWARD_LIMIT} THEN 'domain'
                END AS reason)
                WHERE true
                ON CONFLICT (user_id) DO NOTHING
                RETURNING candidate_reason, network`,
            )
            .bind(
                userId,
                network ?? null,
                domain,
                now,
                holds ? 1 : 0,
                countedDomain,
            ),
        d1
            .prepare(
                `DELETE FROM setup_reward_decision
                WHERE user_id IN (${expired(false)})`,
            )
            .bind(now - RETENTION_SECONDS),
        d1
            .prepare(
                `UPDATE setup_reward_decision SET network = NULL, email_domain = NULL
                WHERE user_id IN (${expired(true)})`,
            )
            .bind(now - RETENTION_SECONDS),
    ]);
    const row = inserted?.results[0];
    if (!row?.candidate_reason) return null;
    return {
        reason: row.candidate_reason,
        key:
            row.candidate_reason === "network"
                ? (row.network ?? "")
                : (countedDomain ?? ""),
    };
}

// Discord embed side bar, as in infra-watch: yellow while only recording,
// orange once new accounts are held.
const WATCHING = 0xef9f27;
const HOLDING = 0xd85a30;

/** A box titled with what happened, in infra-watch's alert style. */
function panel(title: string, rows: [string, string][]): string {
    const body = rows.map(([field, value]) => `${field.padEnd(9)}${value}`);
    const inner = Math.max(30, title.length + 2, ...body.map((t) => t.length));
    return [
        "```",
        `┌─ ${title} ${"─".repeat(inner - title.length - 1)}┐`,
        ...body.map((t) => `│ ${t.padEnd(inner)} │`),
        `└${"─".repeat(inner + 2)}┘`,
        "```",
    ].join("\n");
}

/**
 * Posts to Discord when a network or private domain passes 30, 100 and 1,000
 * accounts in 24 hours, once per milestone. Without a webhook (local, tests)
 * the message is only logged.
 */
export async function reportSetupRewardCandidate(
    env: Env["Bindings"],
    { reason, key }: SetupRewardCandidate,
    holds: boolean,
): Promise<void> {
    const column = reason === "network" ? "network" : "email_domain";
    const row = await env.DB.prepare(
        `SELECT COUNT(*) AS accounts, MIN(first_reward_at) AS since
        FROM setup_reward_decision
        WHERE ${column} = ?1 AND first_reward_at > ?2`,
    )
        .bind(key, Math.floor(Date.now() / 1000) - DAY_SECONDS)
        .first<{ accounts: number; since: number }>();
    const accounts = row?.accounts ?? 0;
    const milestone = REPORT_MILESTONES.findLast((m) => accounts > m);
    if (!row || !milestone) return;
    const sentKey = `setup-reward-report:${reason}:${key}:${milestone}`;
    if (await env.KV.get(sentKey)) return;
    await env.KV.put(sentKey, "1", { expirationTtl: DAY_SECONDS });

    const where =
        reason === "network"
            ? `network ${key}/${key.includes(":") ? 48 : 24}`
            : `domain ${key}`;
    const staging = env.ENVIRONMENT === "staging" ? "[staging] " : "";
    const description = panel(
        `${staging}${holds ? "HOLDING" : "WATCHING"}: ${where}`,
        [
            ["ACCOUNTS", `${accounts} in 24h (limit ${SETUP_REWARD_LIMIT})`],
            [
                "SINCE",
                `${new Date(row.since * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`,
            ],
            ["REWARDS", holds ? "new accounts held" : "paid, holds are off"],
        ],
    );
    const webhook = env.SETUP_REWARD_DISCORD_WEBHOOK_URL;
    if (!webhook) {
        log.info("SETUP_REWARD_REPORT (no webhook):\n{description}", {
            description,
        });
        return;
    }
    const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "Onboarding rewards",
            embeds: [{ description, color: holds ? HOLDING : WATCHING }],
            allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Discord webhook -> ${response.status}`);
}

export async function isSetupRewardHeld(
    db: QuestDb,
    userId: string,
): Promise<boolean> {
    const rows = await db
        .select({ userId: setupRewardDecision.userId })
        .from(setupRewardDecision)
        .where(
            and(
                eq(setupRewardDecision.userId, userId),
                isNotNull(setupRewardDecision.heldReason),
            ),
        )
        .limit(1);
    return rows.length > 0;
}
