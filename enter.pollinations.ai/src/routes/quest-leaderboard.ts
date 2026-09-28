import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards as rewardsTable } from "@shared/db/better-auth.ts";
import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const LEADERBOARD_CACHE_KEY = "quests:leaderboard:v2";
const LEADERBOARD_CACHE_TTL = 60;
const LEADERBOARD_LIMIT = 50;

// Retain the public wire name; this now counts earned rewards, including grants.
const rewardCountSchema = z
    .number()
    .int()
    .nonnegative()
    .describe(
        "Number of earned reward entries, including unclaimed rewards and one-off grants. completedQuests is the legacy field name.",
    );

const leaderboardEntrySchema = z.object({
    githubLogin: z.string(),
    completedQuests: rewardCountSchema,
    totalPollen: z.number().nonnegative(),
});

const questLeaderboardResponseSchema = z.object({
    leaderboard: z.array(leaderboardEntrySchema),
    totals: z.object({
        contributors: z.number().int().nonnegative(),
        completedQuests: rewardCountSchema,
        totalPollen: z.number().nonnegative(),
    }),
});

export type QuestLeaderboardResponse = z.infer<
    typeof questLeaderboardResponseSchema
>;

export const questLeaderboardRoutes = new Hono<Env>().get(
    "/leaderboard",
    describeRoute({
        tags: ["✨ Quests"],
        summary: "Get Quest Leaderboard",
        security: [],
        description:
            "Returns totals for all recorded Quest rewards and recognition grants, claimed or unclaimed. Rankings show public GitHub usernames only; totals also include rewards without a public identity. Purchases and app/model usage earnings are excluded.",
        responses: {
            200: {
                description: "Quest leaderboard",
                content: {
                    "application/json": {
                        schema: resolver(questLeaderboardResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => {
        const cached = await c.env.KV.get<QuestLeaderboardResponse>(
            LEADERBOARD_CACHE_KEY,
            "json",
        );
        if (cached) return c.json(cached);

        const response = await buildQuestLeaderboard(c.env);
        await c.env.KV.put(LEADERBOARD_CACHE_KEY, JSON.stringify(response), {
            expirationTtl: LEADERBOARD_CACHE_TTL,
        });
        return c.json(response);
    },
);

/**
 * The reward ledger contains Quest rewards and grants, not purchases or usage
 * earnings. Aggregate it independently of the public ranking so private accounts
 * and entries beyond the ranking limit still contribute to the totals.
 */
async function buildQuestLeaderboard(
    env: CloudflareBindings,
): Promise<QuestLeaderboardResponse> {
    const db = drizzle(env.DB);
    const githubLogin = sql<string>`lower(trim(${schema.user.githubUsername}))`;
    const rewardCount = sql<number>`count(*)`.mapWith(Number);
    const pollenTotal =
        sql<number>`coalesce(sum(${rewardsTable.pollenAmount}), 0)`.mapWith(
            Number,
        );
    const [totals] = await db
        .select({
            contributors:
                sql<number>`count(distinct ${rewardsTable.userId})`.mapWith(
                    Number,
                ),
            completedQuests: rewardCount,
            totalPollen: pollenTotal,
        })
        .from(rewardsTable);
    const rows = await db
        .select({
            githubLogin,
            completedQuests: rewardCount,
            totalPollen: pollenTotal,
        })
        .from(rewardsTable)
        .innerJoin(schema.user, eq(rewardsTable.userId, schema.user.id))
        .where(sql`${githubLogin} <> ''`)
        .groupBy(githubLogin)
        .orderBy(desc(pollenTotal), desc(rewardCount), asc(githubLogin))
        .limit(LEADERBOARD_LIMIT);

    return {
        leaderboard: rows.map((row) => ({
            ...row,
            totalPollen: roundPollenLedgerAmount(row.totalPollen),
        })),
        totals: {
            ...totals,
            totalPollen: roundPollenLedgerAmount(totals.totalPollen),
        },
    };
}
