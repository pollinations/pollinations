import { getLogger } from "@logtape/logtape";
import { setupRewardHeld } from "@shared/billing/rewards.ts";
import { sql } from "drizzle-orm";
import type { Env } from "../env.ts";
import type { QuestDb } from "./quests/types.ts";

const log = getLogger(["enter", "setup-reward-holds"]);

/** Accounts on one private email domain in 24 hours before it is flagged. */
const SETUP_REWARD_LIMIT = 30;
const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_SECONDS = 30 * DAY_SECONDS;
const CLEANUP_BATCH_SIZE = 100;
// Discord embed side bar, as in infra-watch: yellow while holds are off,
// orange once they're on.
const WATCHING = 0xef9f27;
const HOLDING = 0xd85a30;

/** Shared mail providers are never counted or flagged. */
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

/** A domain that a sign-up just flagged. */
export type FlaggedDomain = { domain: string; accounts: number };

export const setupRewardHoldsOn = (env: Env["Bindings"]) =>
    env.SETUP_REWARD_HOLDS === "on";

/**
 * Records an account on a private email domain at its first setup reward and
 * flags the domain once more than 30 accounts on it did so in 24 hours. A D1
 * batch is one transaction, so concurrent sign-ups flag a domain once and
 * retries count once. The batch also deletes sign-ups older than 30 days.
 */
export async function recordSetupRewardSignup(
    d1: D1Database,
    { userId, email }: { userId: string; email: string },
): Promise<FlaggedDomain | null> {
    const now = Math.floor(Date.now() / 1000);
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    const cleanup = d1
        .prepare(
            `DELETE FROM setup_reward_signup WHERE user_id IN (
                SELECT user_id FROM setup_reward_signup
                WHERE first_reward_at < ?1
                ORDER BY first_reward_at
                LIMIT ${CLEANUP_BATCH_SIZE}
            )`,
        )
        .bind(now - RETENTION_SECONDS);
    if (PUBLIC_MAIL_DOMAINS.has(domain)) {
        await cleanup.run();
        return null;
    }
    const [, flagged] = await d1.batch<FlaggedDomain>([
        d1
            .prepare(
                `INSERT INTO setup_reward_signup (user_id, email_domain, first_reward_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT (user_id) DO NOTHING`,
            )
            .bind(userId, domain, now),
        d1
            .prepare(
                `INSERT INTO flagged_email_domain (domain, flagged_at, accounts)
                SELECT ?1, ?2, accounts FROM (
                    SELECT COUNT(*) AS accounts FROM setup_reward_signup
                    WHERE email_domain = ?1 AND first_reward_at > ?2 - ${DAY_SECONDS}
                )
                WHERE accounts > ${SETUP_REWARD_LIMIT}
                ON CONFLICT (domain) DO NOTHING
                RETURNING domain, accounts`,
            )
            .bind(domain, now),
        cleanup,
    ]);
    return flagged?.results[0] ?? null;
}

/** Whether the account's setup rewards are held right now. */
export async function isSetupRewardHeld(
    env: Env["Bindings"],
    db: QuestDb,
    userId: string,
): Promise<boolean> {
    if (!setupRewardHoldsOn(env)) return false;
    const [row] = await db.all<{ held: number }>(
        sql`SELECT ${setupRewardHeld(userId)} AS held`,
    );
    return Boolean(row?.held);
}

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
 * Posts to Discord when a domain is flagged: what happened, the numbers and
 * the decision. Without a webhook (local, tests) the message is only logged.
 */
export async function reportFlaggedDomain(
    env: Env["Bindings"],
    { domain, accounts }: FlaggedDomain,
): Promise<void> {
    const holds = setupRewardHoldsOn(env);
    const row = await env.DB.prepare(
        `SELECT MIN(first_reward_at) AS since FROM setup_reward_signup
        WHERE email_domain = ?1 AND first_reward_at > ?2`,
    )
        .bind(domain, Math.floor(Date.now() / 1000) - DAY_SECONDS)
        .first<{ since: number }>();
    const since = new Date((row?.since ?? 0) * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
    const staging = env.ENVIRONMENT === "staging" ? "[staging] " : "";
    const description = panel(`${staging}FLAGGED: domain ${domain}`, [
        ["ACCOUNTS", `${accounts} in 24h (limit ${SETUP_REWARD_LIMIT})`],
        ["SINCE", `${since} UTC`],
        [
            "DECISION",
            holds ? "onboarding rewards held" : "recorded only, holds are off",
        ],
        ["UNDO", "allow the domain in Enter"],
    ]);
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
