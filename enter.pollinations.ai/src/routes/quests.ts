import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { getRewardLedgerStats } from "../services/quest-stats.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import { listQuestCards } from "../services/quests/index.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
} from "../services/quests/types.ts";

// Bumped to v17: the app-growth group gained the app-listed quest.
const CACHE_KEY = "quests:catalog:v17";
const CACHE_TTL = 60;

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
    availability: z.enum(["available", "completed", "coming_soon"]),
    rewardAmount: z.number().nullable(),
    balanceBucket: z.enum(["tier", "pack"]),
    url: z.string().nullable(),
    stats: questCardStatsSchema,
});

const questCatalogResponseSchema = z.object({
    quests: z.array(questCatalogItemSchema),
});

export const questsRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["Quests"],
        summary: "Get Quests",
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
