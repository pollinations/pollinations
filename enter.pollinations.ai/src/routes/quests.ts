import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import { listQuestCards } from "../services/quests/index.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
} from "../services/quests/types.ts";

const CACHE_KEY = "quests:catalog:v11";
const CACHE_TTL = 60;

export type QuestCatalogItem = QuestCard;

export type QuestCatalogResponse = {
    quests: QuestCatalogItem[];
};

const questCatalogItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(QUEST_CATEGORIES),
    availability: z.enum(["available", "completed"]),
    rewardAmount: z.number().nullable(),
    url: z.string().nullable(),
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

async function buildQuestCatalog(
    env: CloudflareBindings,
): Promise<QuestCatalogResponse> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const cards = await listQuestCards(ctx);
    const quests = [...cards].sort((a, b) => a.title.localeCompare(b.title));

    return {
        quests,
    };
}
