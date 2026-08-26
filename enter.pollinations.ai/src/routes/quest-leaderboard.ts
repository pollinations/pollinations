import * as schema from "@shared/db/better-auth.ts";
import { rewards as rewardsTable } from "@shared/db/better-auth.ts";
import { and, eq, isNotNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const LEADERBOARD_CACHE_KEY = "quests:leaderboard:v1";
const LEADERBOARD_CACHE_TTL = 60;
const LEADERBOARD_LIMIT = 50;

const leaderboardEntrySchema = z.object({
    githubLogin: z.string(),
    completedQuests: z.number().int().nonnegative(),
    totalPollen: z.number().nonnegative(),
});

const questLeaderboardResponseSchema = z.object({
    leaderboard: z.array(leaderboardEntrySchema),
    totals: z.object({
        contributors: z.number().int().nonnegative(),
        completedQuests: z.number().int().nonnegative(),
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
            "Returns public aggregate totals and top contributors for completed GitHub POLLEN-QUEST issue rewards.",
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
 * Aggregate every completed public GitHub quest first, then cap only the
 * returned ranking. This keeps the public totals global even after the board
 * grows beyond the presentation limit.
 */
async function buildQuestLeaderboard(
    env: CloudflareBindings,
): Promise<QuestLeaderboardResponse> {
    const db = drizzle(env.DB);
    const rows = await db
        .select({
            githubLogin: schema.user.githubUsername,
            completedQuests: sql<number>`count(${rewardsTable.id})`.mapWith(
                Number,
            ),
            totalPollen:
                sql<number>`coalesce(sum(${rewardsTable.pollenAmount}), 0)`.mapWith(
                    Number,
                ),
        })
        .from(rewardsTable)
        .innerJoin(schema.user, eq(rewardsTable.userId, schema.user.id))
        .where(
            and(
                like(rewardsTable.questId, "github:issue:%"),
                isNotNull(schema.user.githubUsername),
            ),
        )
        .groupBy(schema.user.id, schema.user.githubUsername);

    const contributors = rows
        .flatMap((row) =>
            row.githubLogin
                ? [
                      {
                          githubLogin: row.githubLogin,
                          completedQuests: row.completedQuests,
                          totalPollen: row.totalPollen,
                      },
                  ]
                : [],
        )
        .sort(
            (a, b) =>
                b.totalPollen - a.totalPollen ||
                b.completedQuests - a.completedQuests ||
                a.githubLogin.localeCompare(b.githubLogin),
        );

    return {
        leaderboard: contributors.slice(0, LEADERBOARD_LIMIT),
        totals: {
            contributors: contributors.length,
            completedQuests: contributors.reduce(
                (sum, entry) => sum + entry.completedQuests,
                0,
            ),
            totalPollen: contributors.reduce(
                (sum, entry) => sum + entry.totalPollen,
                0,
            ),
        },
    };
}
