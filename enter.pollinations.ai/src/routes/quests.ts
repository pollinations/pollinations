import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import type { Env } from "../env.ts";

const REPO = "pollinations/pollinations";
const QUEST_LABELS = ["POLLEN-QUEST", "DEV-QUEST"] as const;
const CACHE_KEY = "quests:overview:v1";
const CACHE_TTL = 10 * 60;
const GITHUB_HEADERS = {
    Accept: "application/vnd.github+json",
    "User-Agent": "pollinations-enter-quest-overview",
};

type GitHubSearchIssue = {
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
    items?: GitHubSearchIssue[];
};

type GitHubTimelineEvent = {
    event: string;
    created_at?: string;
    source?: {
        issue?: {
            number: number;
            title: string;
            html_url: string;
            state: "open" | "closed";
            user?: { login: string } | null;
            pull_request?: unknown;
        };
    };
};

export type QuestLinkedPullRequest = {
    number: number;
    title: string;
    url: string;
    state: "open" | "closed";
    author: string | null;
    referencedAt: string | null;
};

export type QuestOverviewItem = {
    number: number;
    title: string;
    state: "open" | "closed";
    author: string | null;
    assignees: string[];
    labels: string[];
    url: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    description: string;
    rewardPollen: number | null;
    rewardText: string | null;
    linkedPullRequests: QuestLinkedPullRequest[];
    payoutPollen: number | null;
    payoutStatus: "unknown";
};

export type QuestOverviewResponse = {
    generatedAt: string;
    quests: QuestOverviewItem[];
};

export const questsRoutes = new Hono<Env>().get("/", async (c) => {
    const log = getLogger(["enter", "quests"]);
    const cached = await readCached(c.env.KV);
    if (cached) return c.json(cached);

    try {
        const overview = await fetchQuestOverview();
        await c.env.KV.put(CACHE_KEY, JSON.stringify(overview), {
            expirationTtl: CACHE_TTL,
        });
        return c.json(overview);
    } catch (error) {
        log.warn("Quest overview fetch failed: {error}", { error });
        throw error;
    }
});

async function readCached(
    kv: KVNamespace,
): Promise<QuestOverviewResponse | null> {
    try {
        return await kv.get<QuestOverviewResponse>(CACHE_KEY, "json");
    } catch {
        return null;
    }
}

async function fetchQuestOverview(): Promise<QuestOverviewResponse> {
    const labelResults = await Promise.all(
        QUEST_LABELS.map((label) => fetchIssuesForLabel(label)),
    );
    const issues = dedupeIssues(labelResults.flat());
    const quests = await Promise.all(issues.map(toQuestOverviewItem));

    quests.sort((a, b) => {
        if (a.state !== b.state) return a.state === "open" ? -1 : 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

    return {
        generatedAt: new Date().toISOString(),
        quests,
    };
}

async function fetchIssuesForLabel(
    label: string,
): Promise<GitHubSearchIssue[]> {
    const params = new URLSearchParams({
        q: `repo:${REPO} is:issue label:${label}`,
        per_page: "100",
        sort: "updated",
        order: "desc",
    });
    const data = await githubJson<GitHubSearchResponse>(
        `https://api.github.com/search/issues?${params.toString()}`,
    );
    return data.items ?? [];
}

function dedupeIssues(issues: GitHubSearchIssue[]): GitHubSearchIssue[] {
    const byNumber = new Map<number, GitHubSearchIssue>();
    for (const issue of issues) byNumber.set(issue.number, issue);
    return [...byNumber.values()];
}

async function toQuestOverviewItem(
    issue: GitHubSearchIssue,
): Promise<QuestOverviewItem> {
    const body = issue.body ?? "";
    return {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? null,
        assignees: (issue.assignees ?? []).map((a) => a.login),
        labels: normalizeLabels(issue.labels ?? []),
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
        description: extractDescription(body),
        rewardPollen: extractRewardPollen(body),
        rewardText: extractRewardText(body),
        linkedPullRequests: await fetchLinkedPullRequests(issue.number),
        payoutPollen: null,
        payoutStatus: "unknown",
    };
}

function normalizeLabels(labels: Array<string | { name?: string }>): string[] {
    return labels
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter((name): name is string => !!name);
}

async function fetchLinkedPullRequests(
    issueNumber: number,
): Promise<QuestLinkedPullRequest[]> {
    const events = await githubJson<GitHubTimelineEvent[]>(
        `https://api.github.com/repos/${REPO}/issues/${issueNumber}/timeline?per_page=100`,
    );
    const byNumber = new Map<number, QuestLinkedPullRequest>();

    for (const event of events) {
        const pr = event.source?.issue;
        if (!pr?.pull_request) continue;
        if (byNumber.has(pr.number)) continue;
        byNumber.set(pr.number, {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            state: pr.state,
            author: pr.user?.login ?? null,
            referencedAt: event.created_at ?? null,
        });
    }

    return [...byNumber.values()].sort((a, b) => b.number - a.number);
}

async function githubJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: GITHUB_HEADERS });
    if (!response.ok) {
        throw new Error(`GitHub request failed: ${response.status} ${url}`);
    }
    return (await response.json()) as T;
}

function extractRewardPollen(body: string): number | null {
    const text = extractRewardText(body);
    if (!text) return null;
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:pollen|p)?\b/i);
    return match ? Number(match[1]) : null;
}

function extractRewardText(body: string): string | null {
    const rewardSection = body.match(
        /(?:^|\n)#{2,4}\s*[^A-Za-z0-9\n]{0,4}\s*reward[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|\n$)/i,
    );
    if (rewardSection?.[1]) {
        return compactMarkdown(rewardSection[1]).slice(0, 180) || null;
    }

    const inline = body.match(
        /(?:reward|paid|credited)[^\n]{0,80}?([0-9]+(?:\.[0-9]+)?\s*(?:pollen|p)\b)[^\n]*/i,
    );
    return inline?.[0] ? compactMarkdown(inline[0]).slice(0, 180) : null;
}

function extractDescription(body: string): string {
    const preferred = body.match(
        /(?:^|\n)#{2,4}\s*(?:the idea|goal|quest goal|context|what|proposal|scope)[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|\n$)/i,
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
