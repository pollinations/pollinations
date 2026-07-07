import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/better-auth.ts";

export interface LinkedGithub {
    githubId: number;
    username: string | null;
}

/**
 * Resolve a user's linked GitHub account from the `account` table.
 * `accountId` holds the immutable GitHub numeric id (as a string);
 * `username` is the mutable login synced on login. Returns null when the
 * user has no GitHub account linked (e.g. a Google-only user).
 */
export async function getLinkedGithub(
    db: DrizzleD1Database<typeof schema>,
    userId: string,
): Promise<LinkedGithub | null> {
    const row = await db
        .select({
            accountId: schema.account.accountId,
            username: schema.account.username,
        })
        .from(schema.account)
        .where(
            and(
                eq(schema.account.userId, userId),
                eq(schema.account.providerId, "github"),
            ),
        )
        .get();
    if (!row) return null;
    const githubId = Number(row.accountId);
    if (!Number.isFinite(githubId)) return null;
    return { githubId, username: row.username ?? null };
}
