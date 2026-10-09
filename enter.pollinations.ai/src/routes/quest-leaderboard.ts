import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards as rewardsTable } from "@shared/db/better-auth.ts";
import { and, eq, gte, inArray, isNotNull, like, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { TOP_UP_QUEST_IDS } from "../services/quests/groups/account-setup.ts";

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
    const githubLogin = sql<string>`lower(${schema.user.githubUsername})`;
    const rows = await db
        .select({
            githubLogin,
            completedQuests:
                sql<number>`count(distinct ${rewardsTable.questId})`.mapWith(
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
        .groupBy(githubLogin);

    const contributors = rows
        .map((row) => ({
            githubLogin: row.githubLogin,
            completedQuests: row.completedQuests,
            totalPollen: roundPollenLedgerAmount(row.totalPollen),
        }))
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
            totalPollen: roundPollenLedgerAmount(
                contributors.reduce((sum, entry) => sum + entry.totalPollen, 0),
            ),
        },
    };
}

const STANDINGS_PODIUM = 3;
const STANDINGS_ABOVE = 2;
const STANDINGS_BELOW = 1;

export const questStandingRowSchema = z.object({
    rank: z.number().int().positive(),
    githubLogin: z.string(),
    totalPollen: z.number().nonnegative(),
    supporter: z.boolean(),
    // Places gained (+) or lost (-) since the start of today (UTC); null when
    // the row was not on the board yet.
    movement: z.number().int().nullable(),
});

export const questStandingsResponseSchema = z.object({
    month: z.string(),
    endsAt: z.string(),
    participants: z.number().int().nonnegative(),
    rows: z.array(questStandingRowSchema),
    you: z
        .object({
            githubLogin: z.string(),
            rank: z.number().int().positive().nullable(),
            totalPollen: z.number().nonnegative(),
        })
        .nullable(),
});

export type QuestStandingsResponse = z.infer<
    typeof questStandingsResponseSchema
>;

/**
 * This calendar month's (UTC) Quest Pollen race, cut down to what one viewer
 * needs: the podium plus the rows just above and below them. Every quest
 * reward counts. Supporters are earners of a top-up quest at any time.
 * Movement compares each rank with the same race replayed up to the start of
 * today (UTC), so it comes straight from the reward ledger.
 */
export async function buildQuestStandings(
    env: CloudflareBindings,
    viewerGithubLogin: string | null,
    now = new Date(),
): Promise<QuestStandingsResponse> {
    const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const db = drizzle(env.DB);
    const githubLogin = sql<string>`lower(${schema.user.githubUsername})`;
    const rows = await db
        .select({
            githubLogin,
            totalPollen: sql<number>`sum(${rewardsTable.pollenAmount})`.mapWith(
                Number,
            ),
            yesterdayPollen:
                sql<number>`coalesce(sum(case when ${lt(rewardsTable.earnedAt, todayStart)} then ${rewardsTable.pollenAmount} end), 0)`.mapWith(
                    Number,
                ),
        })
        .from(rewardsTable)
        .innerJoin(schema.user, eq(rewardsTable.userId, schema.user.id))
        .where(
            and(
                gte(rewardsTable.earnedAt, monthStart),
                isNotNull(schema.user.githubUsername),
            ),
        )
        .groupBy(githubLogin);

    const rankBy = (pollen: (row: (typeof rows)[number]) => number) =>
        rows
            .map((row) => ({
                githubLogin: row.githubLogin,
                totalPollen: roundPollenLedgerAmount(pollen(row)),
            }))
            .filter((row) => row.totalPollen > 0)
            .sort(
                (a, b) =>
                    b.totalPollen - a.totalPollen ||
                    a.githubLogin.localeCompare(b.githubLogin),
            );
    const ranking = rankBy((row) => row.totalPollen);
    const yesterdayRank = new Map(
        rankBy((row) => row.yesterdayPollen).map((row, index) => [
            row.githubLogin,
            index + 1,
        ]),
    );

    const viewer = viewerGithubLogin?.toLowerCase() ?? null;
    const viewerIndex = ranking.findIndex((row) => row.githubLogin === viewer);
    const shown = ranking
        .map((row, index) => ({ ...row, rank: index + 1 }))
        .filter(
            ({ rank }) =>
                rank <= STANDINGS_PODIUM ||
                (viewerIndex >= 0 &&
                    rank >= viewerIndex + 1 - STANDINGS_ABOVE &&
                    rank <= viewerIndex + 1 + STANDINGS_BELOW),
        );

    const supporters = new Set(
        shown.length === 0
            ? []
            : (
                  await db
                      .selectDistinct({ githubLogin })
                      .from(rewardsTable)
                      .innerJoin(
                          schema.user,
                          eq(rewardsTable.userId, schema.user.id),
                      )
                      .where(
                          and(
                              inArray(rewardsTable.questId, TOP_UP_QUEST_IDS),
                              inArray(
                                  githubLogin,
                                  shown.map((row) => row.githubLogin),
                              ),
                          ),
                      )
              ).map((row) => row.githubLogin),
    );

    return {
        month: monthStart.toISOString().slice(0, 7),
        endsAt: monthEnd.toISOString(),
        participants: ranking.length,
        rows: shown.map((row) => {
            const before = yesterdayRank.get(row.githubLogin);
            return {
                ...row,
                supporter: supporters.has(row.githubLogin),
                movement: before === undefined ? null : before - row.rank,
            };
        }),
        you: viewer
            ? {
                  githubLogin: viewer,
                  rank: viewerIndex >= 0 ? viewerIndex + 1 : null,
                  totalPollen: ranking[viewerIndex]?.totalPollen ?? 0,
              }
            : null,
    };
}
