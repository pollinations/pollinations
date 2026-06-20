import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { loadQuestInstances } from "../services/quests/index.ts";
import type { QuestInstance } from "../services/quests/types.ts";

const CACHE_KEY = "quests:catalog:v2";
const CACHE_TTL = 60;

export type QuestCatalogItem = Omit<QuestInstance, "sortKey">;

export type QuestCatalogResponse = {
    generatedAt: string;
    quests: QuestCatalogItem[];
};

const questCatalogItemSchema = z.object({
    id: z.string(),
    kind: z.string(),
    title: z.string(),
    description: z.string(),
    availability: z.enum(["available", "claimed", "completed"]),
    rewardAmount: z.number().nullable(),
    url: z.string().nullable(),
    assignees: z.array(z.string()).optional(),
});

const questCatalogResponseSchema = z.object({
    generatedAt: z.string(),
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

        const catalog = await buildQuestCatalog(c.env.DB);
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
    dbBinding: D1Database,
): Promise<QuestCatalogResponse> {
    const quests = (await loadQuestInstances(dbBinding))
        .sort(compareCatalogItems)
        .map(stripInternalCatalogFields);

    return {
        generatedAt: new Date().toISOString(),
        quests,
    };
}

function stripInternalCatalogFields({
    sortKey: _sortKey,
    ...quest
}: QuestInstance): QuestCatalogItem {
    return quest;
}

function compareCatalogItems(left: QuestInstance, right: QuestInstance) {
    if (left.kind !== right.kind) return left.kind === "product" ? -1 : 1;
    const leftTime = Date.parse(left.sortKey ?? "");
    const rightTime = Date.parse(right.sortKey ?? "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
}
