import { setupRewardDecision } from "@shared/db/better-auth.ts";
import { and, eq, isNotNull } from "drizzle-orm";
import type { QuestDb } from "./quests/types.ts";

/** Other accounts on one network or private domain in 24 hours before holds. */
const SETUP_REWARD_LIMIT = 30;
const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_SECONDS = 30 * DAY_SECONDS;
const CLEANUP_BATCH_SIZE = 100;

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
 * The same batch clears network and domain on rows older than 30 days.
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
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    const countedDomain = PUBLIC_MAIL_DOMAINS.has(domain) ? null : domain;
    await d1.batch([
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
                ON CONFLICT (user_id) DO NOTHING`,
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
                `UPDATE setup_reward_decision SET network = NULL, email_domain = NULL
                WHERE user_id IN (
                    SELECT user_id FROM setup_reward_decision
                    WHERE email_domain IS NOT NULL AND first_reward_at < ?1
                    ORDER BY first_reward_at
                    LIMIT ${CLEANUP_BATCH_SIZE}
                )`,
            )
            .bind(now - RETENTION_SECONDS),
    ]);
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
