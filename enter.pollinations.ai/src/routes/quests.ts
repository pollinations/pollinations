import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { listQuestCatalog } from "../services/quest-definitions.ts";

const questDefinitionSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    status: z.string(),
    trigger: z.string(),
    rewardAmount: z.number(),
    balanceBucket: z.string(),
    repeatability: z.string(),
    criteria: z.record(z.string(), z.unknown()).nullable(),
    storage: z.string(),
});

const questCatalogResponseSchema = z.object({
    quests: z.array(questDefinitionSchema),
});

export const questsRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["Quests"],
        summary: "List Quests",
        description:
            "Returns the checked-in quest catalog. Active quests are grantable by the current evaluator; planned quests are visible but not yet auto-granted.",
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
    async (c) => c.json({ quests: await listQuestCatalog(c.env.DB) }),
);
