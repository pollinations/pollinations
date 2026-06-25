import { claimReward } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards as rewardsTable } from "@shared/db/better-auth.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { checkQuestsForUser } from "../services/quest-checker.ts";
import { getRewardLedgerStats } from "../services/quest-stats.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import {
    findQuestCardByIdBestEffort,
    listQuestCards,
} from "../services/quests/index.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
} from "../services/quests/types.ts";

// Bumped to v19: added the Contribute coming-soon GitHub issue placeholder.
const CACHE_KEY = "quests:catalog:v19";
const CACHE_TTL = 60;
const QUEST_CHECK_THROTTLE_SECONDS = 60;

// Per-quest reward-ledger stats shown on the catalog card. Read from rewards:
// rows exist once users have checked their quests, so these are ledger stats,
// not total latent eligibility counts.
export type QuestCardStats = {
    earned: number;
    claimed: number;
    unclaimed: number;
    pollenAwarded: number;
    pollenClaimed: number;
    pollenAwardedPercent: number;
};

export type QuestCatalogItem = QuestCard & { stats: QuestCardStats };

export type QuestCatalogResponse = {
    quests: QuestCatalogItem[];
};

const questCardStatsSchema = z.object({
    earned: z.number(),
    claimed: z.number(),
    unclaimed: z.number(),
    pollenAwarded: z.number(),
    pollenClaimed: z.number(),
    pollenAwardedPercent: z.number(),
});

const questCatalogItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(QUEST_CATEGORIES),
    state: z.enum(["available", "completed", "coming_soon"]),
    rewardAmount: z.number(),
    balanceBucket: z.enum(["tier", "pack"]),
    url: z.string().nullable(),
    stats: questCardStatsSchema,
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
});

const questRewardsResponseSchema = z.object({
    totalClaimedPollen: z.number(),
    totalClaimablePollen: z.number(),
    rewards: z.array(rewardSchema),
});

const questCheckResponseSchema = z.object({
    success: z.boolean(),
    checked: z.number(),
    recorded: z.number(),
    rewardIds: z.array(z.string()),
});

const claimRewardResponseSchema = z.object({
    claimed: z.boolean(),
    newBalance: z.number().nullable(),
    reward: rewardSchema,
});

function requireUsagePermission(apiKey?: {
    permissions?: Record<string, string[]>;
}): void {
    if (apiKey && !apiKey.permissions?.account?.includes("usage")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:usage' permission",
        });
    }
}

function formatRewardTimestamp(value: Date | number | string): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(value).toISOString();
}

export const questsRoutes = new Hono<Env>()
    .get(
        "/catalog",
        describeRoute({
            tags: ["Quests"],
            summary: "Get Quest Catalog",
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
    .post(
        "/check",
        describeRoute({
            tags: ["Quests"],
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
            tags: ["Quests"],
            summary: "Get Quest Rewards",
            description:
                "Returns earned quest rewards for the authenticated account, including claim state. Requires `account:usage` permission when using API keys.",
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
            requireUsagePermission(c.var.auth.apiKey);

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
            }));

            const totalClaimedPollen = rewards.reduce(
                (total, reward) =>
                    total + (reward.claimedAt ? reward.pollenAmount : 0),
                0,
            );
            const totalClaimablePollen = rewards.reduce(
                (total, reward) =>
                    total + (reward.claimedAt ? 0 : reward.pollenAmount),
                0,
            );

            return c.json({
                totalClaimedPollen,
                totalClaimablePollen,
                rewards,
            });
        },
    )
    .post(
        "/rewards/:rewardId/claim",
        describeRoute({
            tags: ["Quests"],
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
                409: { description: "Reward cannot be claimed yet" },
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
            const rewardRows = await db
                .select({ questId: rewardsTable.questId })
                .from(rewardsTable)
                .where(
                    and(
                        eq(rewardsTable.id, rewardId),
                        eq(rewardsTable.userId, user.id),
                    ),
                )
                .limit(1);
            const reward = rewardRows[0];
            if (!reward) {
                throw new HTTPException(404, {
                    message: "Reward not found",
                });
            }
            if (reward.questId) {
                const card = await findQuestCardByIdBestEffort(
                    { db, env: c.env },
                    reward.questId,
                );
                if (card?.state === "coming_soon") {
                    throw new HTTPException(409, {
                        message: "This quest is coming soon",
                    });
                }
            }

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

const EMPTY_STATS: QuestCardStats = {
    earned: 0,
    claimed: 0,
    unclaimed: 0,
    pollenAwarded: 0,
    pollenClaimed: 0,
    pollenAwardedPercent: 0,
};

async function buildQuestCatalog(
    env: CloudflareBindings,
): Promise<QuestCatalogResponse> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const [cards, ledger] = await Promise.all([
        listQuestCards(ctx),
        getRewardLedgerStats(env),
    ]);
    const totalPollenAwarded = [...ledger.values()].reduce(
        (total, stat) => total + stat.pollenAwarded,
        0,
    );

    const quests = [...cards]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((card) => {
            const stat = ledger.get(card.id);
            if (!stat) return { ...card, stats: EMPTY_STATS };
            const pollenAwardedPercent =
                totalPollenAwarded > 0
                    ? (stat.pollenAwarded / totalPollenAwarded) * 100
                    : 0;
            return {
                ...card,
                stats: {
                    earned: stat.earned,
                    claimed: stat.claimed,
                    unclaimed: stat.unclaimed,
                    pollenAwarded: stat.pollenAwarded,
                    pollenClaimed: stat.pollenClaimed,
                    pollenAwardedPercent,
                },
            };
        });

    return {
        quests,
    };
}
