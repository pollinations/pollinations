import type { Bucket } from "@shared/billing/deduction.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    catalogDefinitionQuests,
    type PayoutScope,
} from "@shared/quests/definitions.ts";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const CACHE_KEY = "quests:catalog:v2";
const CACHE_TTL = 60;

export type QuestCatalogItem = {
    id: string;
    kind: "product" | "github_issue";
    questTypeId: string;
    title: string;
    description: string;
    availability: "available" | "claimed" | "completed";
    rewardAmount: number | null;
    rewardText: string | null;
    balanceBucket: Bucket;
    payoutScope: PayoutScope;
    url: string | null;
    issueNumber: number | null;
    assignees: string[];
    labels: string[];
    createdAt: string | null;
    updatedAt: string | null;
    closedAt: string | null;
};

export type QuestCatalogResponse = {
    generatedAt: string;
    quests: QuestCatalogItem[];
};

const questCatalogItemSchema = z.object({
    id: z.string(),
    kind: z.enum(["product", "github_issue"]),
    questTypeId: z.string(),
    title: z.string(),
    description: z.string(),
    availability: z.enum(["available", "claimed", "completed"]),
    rewardAmount: z.number().nullable(),
    rewardText: z.string().nullable(),
    balanceBucket: z.string(),
    payoutScope: z.string(),
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
    const productQuests = productCatalogItems();
    const githubQuests = await loadGitHubIssueQuests(dbBinding);
    const quests = [...productQuests, ...githubQuests].sort(
        compareCatalogItems,
    );

    return {
        generatedAt: new Date().toISOString(),
        quests,
    };
}

function productCatalogItems(): QuestCatalogItem[] {
    return catalogDefinitionQuests().map((definition) => ({
        id: definition.id,
        kind: "product",
        questTypeId: definition.id,
        title: definition.title,
        description: definition.description,
        availability: "available",
        rewardAmount: definition.rewardAmount,
        rewardText: `${definition.rewardAmount} Pollen`,
        balanceBucket: definition.balanceBucket,
        payoutScope: definition.payoutScope,
        url: null,
        issueNumber: null,
        assignees: [],
        labels: [],
        createdAt: null,
        updatedAt: null,
        closedAt: null,
    }));
}

async function loadGitHubIssueQuests(
    dbBinding: D1Database,
): Promise<QuestCatalogItem[]> {
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select()
        .from(schema.githubQuestIssues)
        .orderBy(desc(schema.githubQuestIssues.githubUpdatedAt));
    return rows.map((issue) => ({
        id: `github:issue:${issue.issueNumber}`,
        kind: "github_issue",
        questTypeId: issue.questId,
        title: issue.title,
        description: issue.description ?? "",
        availability: githubIssueAvailability(issue.state),
        rewardAmount: issue.rewardAmount,
        rewardText:
            issue.rewardAmount == null ? null : `${issue.rewardAmount} Pollen`,
        balanceBucket: issue.balanceBucket as Bucket,
        payoutScope: "once_per_event_per_user",
        url: issue.url,
        issueNumber: issue.issueNumber,
        assignees: parseAssignees(issue.assigneesJson),
        labels: [],
        createdAt: issue.githubCreatedAt?.toISOString() ?? null,
        updatedAt: issue.githubUpdatedAt?.toISOString() ?? null,
        closedAt: issue.completedAt?.toISOString() ?? null,
    }));
}

function githubIssueAvailability(
    state: string,
): QuestCatalogItem["availability"] {
    if (state === "completed") return "completed";
    if (state === "claimed") return "claimed";
    return "available";
}

function parseAssignees(assigneesJson: string | null): string[] {
    if (!assigneesJson) return [];
    const parsed = JSON.parse(assigneesJson) as unknown;
    return Array.isArray(parsed)
        ? parsed.filter(
              (assignee): assignee is string => typeof assignee === "string",
          )
        : [];
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
