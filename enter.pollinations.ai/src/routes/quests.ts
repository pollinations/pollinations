import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import {
    loadQuestInstances,
    type QuestInstance,
} from "../services/quests/index.ts";

const CACHE_KEY = "quests:catalog:v2";
const CACHE_TTL = 60;

export type QuestCatalogItem = QuestInstance;

export type QuestCatalogResponse = {
    generatedAt: string;
    quests: QuestCatalogItem[];
};

const questCatalogItemSchema = z.object({
    id: z.string(),
    kind: z.enum(["product", "github_issue"]),
    title: z.string(),
    description: z.string(),
    availability: z.enum(["available", "claimed", "completed"]),
    rewardAmount: z.number().nullable(),
    url: z.string().nullable(),
    issueNumber: z.number().nullable(),
    assignees: z.array(z.string()),
    labels: z.array(z.string()),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
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
    const quests = (await loadQuestInstances(dbBinding)).sort(
        compareCatalogItems,
    );

    return {
        generatedAt: new Date().toISOString(),
        quests,
    };
}

function compareCatalogItems(left: QuestCatalogItem, right: QuestCatalogItem) {
    if (left.kind !== right.kind) return left.kind === "product" ? -1 : 1;
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "");
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
}
