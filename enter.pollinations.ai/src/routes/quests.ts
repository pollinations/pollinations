import type { Bucket } from "@shared/billing/deduction.ts";
import {
    type PayoutScope,
    QUEST_DEFINITIONS,
    type QuestCategory,
    type QuestEventType,
} from "@shared/quests/definitions.ts";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const QUEST_REPO = "pollinations/pollinations";
const COMMUNITY_QUEST_LABEL = "POLLEN-QUEST";
const CACHE_KEY = "quests:catalog:v2";
const CACHE_TTL = 60;
const GITHUB_HEADERS = {
    Accept: "application/vnd.github+json",
    "User-Agent": "pollinations-enter-quest-catalog",
};

type GitHubIssue = {
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    body: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    user: { login: string } | null;
    assignees?: { login: string }[];
    labels?: Array<string | { name?: string }>;
};

type GitHubSearchResponse = {
    items?: GitHubIssue[];
};

export type QuestCatalogItem = {
    id: string;
    kind: "product" | "github_issue";
    questTypeId: string;
    title: string;
    description: string;
    category: QuestCategory;
    availability: "available" | "claimed" | "completed";
    rewardAmount: number | null;
    rewardText: string | null;
    balanceBucket: Bucket;
    payoutScope: PayoutScope;
    eventType: QuestEventType;
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
    category: z.string(),
    availability: z.enum(["available", "claimed", "completed"]),
    rewardAmount: z.number().nullable(),
    rewardText: z.string().nullable(),
    balanceBucket: z.string(),
    payoutScope: z.string(),
    eventType: z.string(),
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

        const catalog = await buildQuestCatalog();
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

async function buildQuestCatalog(): Promise<QuestCatalogResponse> {
    const [githubQuests] = await Promise.all([fetchGitHubIssueQuests()]);
    const quests = [...productCatalogItems(), ...githubQuests].sort(
        compareCatalogItems,
    );

    return {
        generatedAt: new Date().toISOString(),
        quests,
    };
}

function productCatalogItems(): QuestCatalogItem[] {
    return QUEST_DEFINITIONS.filter(
        (definition) => definition.status === "active",
    ).map((definition) => ({
        id: definition.id,
        kind: "product",
        questTypeId: definition.id,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        availability: "available",
        rewardAmount: definition.rewardAmount,
        rewardText: `${definition.rewardAmount} Pollen`,
        balanceBucket: definition.balanceBucket,
        payoutScope: definition.payoutScope,
        eventType: definition.eventType,
        url: null,
        issueNumber: null,
        assignees: [],
        labels: [],
        createdAt: null,
        updatedAt: null,
        closedAt: null,
    }));
}

async function fetchGitHubIssueQuests(): Promise<QuestCatalogItem[]> {
    const params = new URLSearchParams({
        q: `repo:${QUEST_REPO} is:issue label:${COMMUNITY_QUEST_LABEL}`,
        per_page: "100",
        sort: "updated",
        order: "desc",
    });
    const data = await githubJson<GitHubSearchResponse>(
        `https://api.github.com/search/issues?${params.toString()}`,
    );
    return (data.items ?? []).map(githubIssueCatalogItem);
}

function githubIssueCatalogItem(issue: GitHubIssue): QuestCatalogItem {
    const body = issue.body ?? "";
    const rewardText = extractRewardText(body);
    return {
        id: `github:issue:${issue.number}`,
        kind: "github_issue",
        questTypeId: "github:community_issue_quest",
        title: issue.title,
        description: extractDescription(body),
        category: "build",
        availability: githubIssueAvailability(issue),
        rewardAmount: extractRewardPollen(rewardText),
        rewardText,
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
        eventType: "github_pr_merged",
        url: issue.html_url,
        issueNumber: issue.number,
        assignees: (issue.assignees ?? []).map((assignee) => assignee.login),
        labels: normalizeLabels(issue.labels ?? []),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
    };
}

function githubIssueAvailability(
    issue: GitHubIssue,
): QuestCatalogItem["availability"] {
    if (issue.state === "closed") return "completed";
    return (issue.assignees?.length ?? 0) > 0 ? "claimed" : "available";
}

function normalizeLabels(labels: Array<string | { name?: string }>): string[] {
    return labels
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter((name): name is string => !!name);
}

async function githubJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) {
        throw new Error(
            `GitHub quest catalog request failed: ${response.status}`,
        );
    }
    return (await response.json()) as T;
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

function extractRewardPollen(rewardText: string | null): number | null {
    if (!rewardText) return null;
    const match = rewardText.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:pollen|p)?\b/i);
    return match ? Number(match[1]) : null;
}

function extractRewardText(body: string): string | null {
    const rewardSection = body.match(
        /(?:^|\n)#{2,4}\s*[^A-Za-z0-9\n]{0,4}\s*reward[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|$)/i,
    );
    if (rewardSection?.[1]) {
        return compactMarkdown(rewardSection[1]).slice(0, 180) || null;
    }
    return null;
}

function extractDescription(body: string): string {
    const preferred = body.match(
        /(?:^|\n)#{2,4}\s*(?:goal|quest goal|scope|what to build)[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|$)/i,
    );
    if (preferred?.[1]) {
        const section = compactMarkdown(preferred[1]);
        if (section) return truncate(section, 260);
    }
    return truncate(compactMarkdown(body), 260);
}

function compactMarkdown(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}
