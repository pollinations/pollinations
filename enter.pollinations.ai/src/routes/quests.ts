import { claimReward } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    rewards as rewardsTable,
    user as usersTable,
} from "@shared/db/better-auth.ts";
import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { checkQuestsForUser } from "../services/quest-checker.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import { listQuestCards } from "../services/quests/index.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
} from "../services/quests/types.ts";
import { requireAccountPermission } from "./account-permissions.ts";

// Bumped to v29: the Discord quest links to account connection and the server.
const CACHE_KEY = "quests:catalog:v29";
const CACHE_TTL = 60;
const LEADERBOARD_CACHE_KEY = "quests:leaderboard:v1";
const QUEST_CHECK_THROTTLE_SECONDS = 60;

export type QuestCatalogResponse = {
    quests: QuestCard[];
};

const questCatalogItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(QUEST_CATEGORIES),
    state: z.enum(["available", "completed", "coming_soon"]),
    rewardAmount: z.number(),
    balanceBucket: z.enum(["tier", "pack"]),
    goal: z
        .object({
            target: z.number(),
            unit: z.enum(["pollen", "users", "days"]),
        })
        .optional(),
    url: z.string().nullable(),
});

const questCatalogResponseSchema = z.object({
    quests: z.array(questCatalogItemSchema),
});

const rewardSchema = z.object({
    id: z.string(),
    questId: z.string().nullable(),
    title: z.string(),
    pollenAmount: z.number(),
    balanceBucket: z.string(),
    earnedAt: z.string(),
    claimedAt: z.string().nullable(),
    url: z.string().nullable().optional(),
});

const questRewardsResponseSchema = z.object({
    rewards: z.array(rewardSchema),
});

const leaderboardEntrySchema = z.object({
    // Public GitHub identity only - never internal user ids.
    githubLogin: z.string(),
    completedQuests: z.number().int(),
    totalPollen: z.number(),
});

const questLeaderboardResponseSchema = z.object({
    leaderboard: z.array(leaderboardEntrySchema),
    totals: z.object({
        contributors: z.number().int(),
        completedQuests: z.number().int(),
        totalPollen: z.number(),
    }),
});

export type QuestLeaderboardResponse = z.infer<
    typeof questLeaderboardResponseSchema
>;

const questCheckResponseSchema = z.object({
    success: z.boolean(),
    recorded: z.number(),
    rewardIds: z.array(z.string()),
    progress: z.array(
        z.object({
            questId: z.string(),
            current: z.number(),
            target: z.number(),
            unit: z.enum(["pollen", "users", "days"]),
        }),
    ),
});

const claimRewardResponseSchema = z.object({
    claimed: z.boolean(),
    newBalance: z.number().nullable(),
    reward: rewardSchema,
});

function formatRewardTimestamp(value: Date | number | string): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(value).toISOString();
}

export const questsRoutes = new Hono<Env>()
    .get(
        "/catalog",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Get Quest Catalog",
            security: [],
            description:
                "Returns product quests and GitHub issue quest instances in one list.",
            responses: {
                200: {
                    description: "Quest catalog",
                    content: {
                        "application/json": {
                            schema: resolver(questCatalogResponseSchema),
                        },
                    },
                },
            },
        }),
        async (c) => {
            const cached = await readCached(c.env.KV);
            if (cached) return c.json(cached);

            const catalog = await buildQuestCatalog(c.env);
            await c.env.KV.put(CACHE_KEY, JSON.stringify(catalog), {
                expirationTtl: CACHE_TTL,
            });
            return c.json(catalog);
        },
    )
    .get(
        "/leaderboard",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Get Quest Leaderboard",
            security: [],
            description:
                "Aggregates public Pollen earned from completed public GitHub POLLEN-QUEST issues, grouped by contributor GitHub login.",
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

            const db = drizzle(c.env.DB);
            const rows = await db
                .select({
                    githubLogin: usersTable.githubUsername,
                    completedQuests: sql<number>`count(*)`.mapWith(Number),
                    totalPollen:
                        sql<number>`sum(${rewardsTable.pollenAmount})`.mapWith(
                            Number,
                        ),
                })
                .from(rewardsTable)
                .innerJoin(usersTable, eq(rewardsTable.userId, usersTable.id))
                .where(
                    and(
                        like(rewardsTable.questId, "github:issue:%"),
                        isNotNull(usersTable.githubUsername),
                    ),
                )
                .groupBy(usersTable.githubUsername)
                .orderBy(desc(sql`sum(${rewardsTable.pollenAmount})`))
                .limit(50);

            const leaderboard = rows.flatMap((row) =>
                row.githubLogin
                    ? [
                          {
                              githubLogin: row.githubLogin,
                              completedQuests: row.completedQuests,
                              totalPollen: row.totalPollen,
                          },
                      ]
                    : [],
            );

            const response: QuestLeaderboardResponse = {
                leaderboard,
                totals: {
                    contributors: leaderboard.length,
                    completedQuests: leaderboard.reduce(
                        (sum, entry) => sum + entry.completedQuests,
                        0,
                    ),
                    totalPollen: leaderboard.reduce(
                        (sum, entry) => sum + entry.totalPollen,
                        0,
                    ),
                },
            };

            await c.env.KV.put(
                LEADERBOARD_CACHE_KEY,
                JSON.stringify(response),
                { expirationTtl: CACHE_TTL },
            );
            return c.json(response);
        },
    )
    .post(
        "/check",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Check Quest Rewards",
            description:
                "Checks the authenticated dashboard user's quest status and records any newly earned pending rewards. Session authentication is required.",
            responses: {
                200: {
                    description: "Quest check result",
                    content: {
                        "application/json": {
                            schema: resolver(questCheckResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "API keys cannot check quest rewards" },
                429: {
                    description: "Rate limited - one check per 60 seconds",
                },
            },
        }),
        auth({ allowApiKey: true, allowSessionCookie: true }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to check quest rewards",
            });
            if (c.var.auth.apiKey) {
                throw new HTTPException(403, {
                    message: "Quest checks require a dashboard session",
                });
            }

            const user = c.var.auth.requireUser();
            const throttleKey = `quest-check:throttle:${user.id}`;
            if (await c.env.KV.get(throttleKey)) {
                return c.json(
                    {
                        error: "rate_limited",
                        message:
                            "Quest checks are limited to once per minute. Try again shortly.",
                    },
                    429,
                    { "Retry-After": String(QUEST_CHECK_THROTTLE_SECONDS) },
                );
            }
            await c.env.KV.put(throttleKey, "1", {
                expirationTtl: QUEST_CHECK_THROTTLE_SECONDS,
            });

            const result = await checkQuestsForUser(c.env, user.id);
            return c.json(result);
        },
    )
    .get(
        "/rewards",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Get Quest Rewards",
            description:
                "Returns earned quest rewards for the authenticated account, including claim state. API keys require the read-only `account:usage` permission.",
            responses: {
                200: {
                    description: "Quest rewards",
                    content: {
                        "application/json": {
                            schema: resolver(questRewardsResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        auth({ allowApiKey: true, allowSessionCookie: true }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view quest rewards",
            });
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "usage");

            const db = drizzle(c.env.DB);
            const rewardRows = await db
                .select({
                    id: rewardsTable.id,
                    questId: rewardsTable.questId,
                    title: rewardsTable.title,
                    pollenAmount: rewardsTable.pollenAmount,
                    balanceBucket: rewardsTable.balanceBucket,
                    earnedAt: rewardsTable.earnedAt,
                    claimedAt: rewardsTable.claimedAt,
                    url: rewardsTable.url,
                })
                .from(rewardsTable)
                .where(eq(rewardsTable.userId, user.id))
                .orderBy(desc(rewardsTable.earnedAt));

            const rewards = rewardRows.map((row) => ({
                id: row.id,
                questId: row.questId,
                title: row.title,
                pollenAmount: row.pollenAmount,
                balanceBucket: row.balanceBucket,
                earnedAt: formatRewardTimestamp(row.earnedAt),
                claimedAt: row.claimedAt
                    ? formatRewardTimestamp(row.claimedAt)
                    : null,
                url: row.url,
            }));

            return c.json({ rewards });
        },
    )
    .post(
        "/rewards/:rewardId/claim",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Claim Quest Reward",
            description:
                "Claims one pending quest reward and credits the authenticated user's balance. Session authentication is required.",
            responses: {
                200: {
                    description: "Reward claim result",
                    content: {
                        "application/json": {
                            schema: resolver(claimRewardResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "API keys cannot claim rewards" },
                404: { description: "Reward not found" },
            },
        }),
        auth({ allowApiKey: true, allowSessionCookie: true }),
        async (c) => {
            await c.var.auth.requireAuthorization({
                message: "Authentication required to claim quest rewards",
            });
            if (c.var.auth.apiKey) {
                throw new HTTPException(403, {
                    message: "Reward claims require a dashboard session",
                });
            }

            const user = c.var.auth.requireUser();
            const rewardId = c.req.param("rewardId");
            const db = drizzle(c.env.DB, { schema });

            const result = await claimReward(db, { rewardId, userId: user.id });
            if (!result.reward) {
                throw new HTTPException(404, {
                    message: "Reward not found",
                });
            }

            return c.json({
                claimed: result.claimed,
                newBalance: result.newBalance,
                reward: {
                    id: result.reward.id,
                    questId: result.reward.questId,
                    title: result.reward.title,
                    pollenAmount: result.reward.pollenAmount,
                    balanceBucket: result.reward.balanceBucket,
                    earnedAt: formatRewardTimestamp(result.reward.earnedAt),
                    claimedAt: result.reward.claimedAt
                        ? formatRewardTimestamp(result.reward.claimedAt)
                        : null,
                },
            });
        },
    );

async function readCached(
    kv: KVNamespace,
): Promise<QuestCatalogResponse | null> {
    return await kv.get<QuestCatalogResponse>(CACHE_KEY, "json");
}

async function buildQuestCatalog(
    env: CloudflareBindings,
): Promise<QuestCatalogResponse> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const cards = await listQuestCards(ctx);

    // Preserve definition order from listQuestCards (group + within-group), so
    // each lane reads in its intended sequence, e.g. Setup: API key -> text ->
    // image -> audio. The frontend still sorts every lane by lifecycle + reward;
    // this order is only the stable tiebreak for equal-reward quests. (Was
    // sorted alphabetically by title, which placed "audio" before "image".)
    return {
        quests: cards,
    };
}
