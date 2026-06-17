import { QUEST_DEFINITIONS } from "@shared/quests/definitions.ts";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const questDefinitionSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    status: z.string(),
    eventType: z.string(),
    rewardAmount: z.number(),
    balanceBucket: z.string(),
    payoutScope: z.string(),
});

const questCatalogResponseSchema = z.object({
    quests: z.array(questDefinitionSchema),
});

export const questsRoutes = new Hono<Env>().get(
    "/catalog",
    describeRoute({
        tags: ["Quests"],
        summary: "Get Quest Catalog",
        description:
            "Returns the active and planned quest catalog from checked-in quest definitions.",
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
    (c) => c.json({ quests: QUEST_DEFINITIONS }),
);
