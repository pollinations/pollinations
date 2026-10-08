import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import { listQuestCards } from "../services/quests/index.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
} from "../services/quests/types.ts";
import {
    buildQuestStandings,
    questStandingsResponseSchema,
} from "./quest-leaderboard.ts";

// Bumped to v30: the app-spend quest is worth 10 Pollen.
const CACHE_KEY = "quests:catalog:v30";
const CACHE_TTL = 60;

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
        "/standings",
        describeRoute({
            tags: ["✨ Quests"],
            summary: "Get Monthly Quest Standings",
            description:
                "Returns this calendar month's (UTC) Quest Pollen ranking: the top three plus, for a signed-in user, the rows around them.",
            responses: {
                200: {
                    description: "Monthly quest standings",
                    content: {
                        "application/json": {
                            schema: resolver(questStandingsResponseSchema),
                        },
                    },
                },
            },
        }),
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            const githubLogin = c.var.auth.user?.githubUsername ?? null;
            return c.json(await buildQuestStandings(c.env, githubLogin));
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
