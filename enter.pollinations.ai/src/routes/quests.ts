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

// Bumped to v12: catalog cards now carry a `stats` block, so v11 entries
// (stat-less) must not be served.
const CACHE_KEY = "quests:catalog:v12";
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
});

const questCatalogItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(QUEST_CATEGORIES),
    availability: z.enum(["available", "completed"]),
    rewardAmount: z.number().nullable(),
    url: z.string().nullable(),
    stats: questCardStatsSchema,
});

const questCatalogResponseSchema = z.object({
    quests: z.array(questCatalogItemSchema),
});

export const questsRoutes = new Hono<Env>().get(
    "/catalog",
    describeRoute({
        tags: ["Quests"],
        summary: "Get Quest Catalog",
        description:
            "Returns product quests and GitHub issue quest instances in one catalog.",
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
        // DEBUG-ONLY: ?debug=1 enriches each quest's stats with a tier/pack
        // balance-bucket split + unique-user count, and BYPASSES the KV cache so
        // the debug payload never leaks into normal cached responses. Remove this
        // branch (and the debug fields) before merge.
        const debug = c.req.query("debug") === "1";
        if (debug) {
            return c.json(await buildQuestCatalog(c.env, true));
        }

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
};

async function buildQuestCatalog(
    env: CloudflareBindings,
    // DEBUG-ONLY flag — see the ?debug=1 branch in the route. Remove before merge.
    debug = false,
): Promise<QuestCatalogResponse> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const [cards, ledger] = await Promise.all([
        listQuestCards(ctx),
        getRewardLedgerStats(env, debug),
    ]);

    const quests = [...cards]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((card) => {
            const stat = ledger.get(card.id);
            if (!stat) return { ...card, stats: EMPTY_STATS };
            return {
                ...card,
                stats: {
                    earned: stat.earned,
                    claimed: stat.claimed,
                    unclaimed: stat.unclaimed,
                    pollenAwarded: stat.pollenAwarded,
                    pollenClaimed: stat.pollenClaimed,
                    // DEBUG-ONLY: per-user-tier breakdown of the same totals.
                    // Absent (dropped from JSON) unless ?debug=1.
                    ...(debug && { byTier: stat.byTier ?? {} }),
                },
            };
        });

    return {
        quests,
    };
}
