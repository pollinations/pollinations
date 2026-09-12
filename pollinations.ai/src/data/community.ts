/**
 * Anonymous community signals and a daily refreshed build-history archive.
 *
 * Most GitHub feeds are requested anonymously from each visitor's browser.
 * The small header signals use cached same-site endpoints so they remain
 * reliable without credentials. Everything degrades to `failed` and hides
 * rather than showing a stale hardcoded number. The diary labels its archive
 * timestamp and explicitly identifies the bundled snapshot during an outage.
 */
import { type UseAsyncOptions, useAsync } from "./useAsync";

const REPO = "pollinations/pollinations";
const GITHUB = "https://api.github.com";
export const REPO_URL = `https://github.com/${REPO}`;
export const DISCORD_URL =
    "https://discord.gg/pollinations-ai-885844321461485618";

async function github<T>(path: string): Promise<T> {
    const response = await fetch(`${GITHUB}${path}`, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`github ${path}: ${response.status}`);
    return response.json() as Promise<T>;
}

/* ── Stars ──────────────────────────────────────────────────────────────── */

export function useRepoStars(options?: UseAsyncOptions) {
    return useAsync<number | null>(
        async () => {
            const response = await fetch("/api/github-stars");
            if (!response.ok) throw new Error(`github: ${response.status}`);
            const repo = (await response.json()) as {
                stargazers_count?: number;
            };
            if (typeof repo.stargazers_count !== "number") return null;
            return repo.stargazers_count;
        },
        null,
        options,
    );
}

/* ── Discord ────────────────────────────────────────────────────────────── */

/**
 * The widget exposes `presence_count` — members online right now — and not
 * total membership, which needs a bot token. The website worker proxies this
 * public value because Discord's widget response does not allow browser CORS.
 */
export function useDiscordPresence(options?: UseAsyncOptions) {
    return useAsync<number | null>(
        async () => {
            const response = await fetch("/api/discord-presence");
            if (!response.ok) throw new Error(`discord: ${response.status}`);
            const widget = (await response.json()) as {
                presence_count?: number;
            };
            return widget.presence_count ?? null;
        },
        null,
        options,
    );
}

/* ── Contributors ───────────────────────────────────────────────────────── */

type Contributor = {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    commits: number;
};

/** Apps and CI accounts commit constantly and would otherwise take the top. */
const isBot = (login: string) =>
    login.includes("[bot]") ||
    login.endsWith("-bot") ||
    login.toLowerCase().includes("copilot");

type GhContributor = {
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
    type?: string;
};

export function useContributors(limit = 12) {
    return useAsync<Contributor[]>(async () => {
        // One request, already ranked by commit count.
        const rows = await github<GhContributor[]>(
            `/repos/${REPO}/contributors?per_page=${limit + 8}`,
        );
        return rows
            .filter((row) => row.type !== "Bot" && !isBot(row.login))
            .slice(0, limit)
            .map((row) => ({
                login: row.login,
                avatarUrl: row.avatar_url,
                profileUrl: row.html_url,
                commits: row.contributions,
            }));
    }, []);
}

/* ── Open votes ─────────────────────────────────────────────────────────── */

type VotingIssue = {
    number: number;
    title: string;
    url: string;
    votes: number;
};

/**
 * Maintainers mark these by prefixing the title, so that marker is the filter
 * rather than a hardcoded list of issue numbers: a new one shows up on its own.
 */
const VOTE_MARKER = "[Voting Issue]";

type GhSearch = {
    items: {
        number: number;
        title: string;
        html_url: string;
        reactions: { "+1": number };
    }[];
};

export function useVotingIssues(limit = 3) {
    return useAsync<VotingIssue[]>(async () => {
        const query = encodeURIComponent(
            `repo:${REPO} is:issue is:open "${VOTE_MARKER}" in:title`,
        );
        const found = await github<GhSearch>(
            `/search/issues?q=${query}&sort=reactions-%2B1&order=desc&per_page=${limit}`,
        );
        return found.items.map((item) => ({
            number: item.number,
            title: item.title.replace(VOTE_MARKER, "").trim(),
            url: item.html_url,
            votes: item.reactions["+1"],
        }));
    }, []);
}

/* ── Build diary ────────────────────────────────────────────────────────── */

const NEWS_RAW =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/daily";
const NEWS_MONTHLY_RAW =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/monthly";
const NEWS_START_DAY = "2025-01-01";
const FALLBACK_DIARY_IMAGES = [
    "2026-08-03",
    "2026-08-05",
    "2026-08-14",
    "2026-08-23",
    "2026-08-28",
].map((date) => `${NEWS_RAW}/${date}/images/twitter.jpg`);

export type DiaryDay = {
    date: string;
    prCount: number;
    title: string | null;
    summary: string | null;
    imageUrl: string | null;
};

type DiaryPr = {
    number: number;
    date: string;
    title: string;
    author: string;
};

type HistoryPayload = {
    generatedAt: string;
    allTimeCount: number;
    pullRequests: DiaryPr[];
};

type DiaryHistory = {
    pullRequests: DiaryPr[];
    byDate: Map<string, DiaryPr[]>;
    firstDay: string;
    latestDay: string;
    allTimeCount: number;
    updatedAt: string;
    fallback: boolean;
};

type DiaryRange = {
    month: string;
    latestDay: string;
    days: DiaryDay[];
    updatedAt: string;
    fallback: boolean;
};

export type DiaryMonth = {
    month: string;
    prCount: number;
    title: string | null;
    summary: string | null;
    imageUrl: string | null;
};

type DiaryAll = {
    months: DiaryMonth[];
};

type DailySummary = {
    date: string;
    title: string;
    summary: string;
};

type MonthlySummary = {
    title: string;
    summary: string;
};

const ISO_MONTH = /^\d{4}-\d{2}$/;
const summaryCache = new Map<string, Promise<DailySummary | null>>();
const monthlySummaryCache = new Map<string, Promise<MonthlySummary | null>>();
let historyCache: Promise<DiaryHistory> | null = null;

function stableIndex(value: string, length: number) {
    if (length === 0) return -1;
    return (
        [...value].reduce(
            (total, character) => total + character.charCodeAt(0),
            0,
        ) % length
    );
}

const HISTORY_ARCHIVE =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/community-pr-history.json";

async function fetchHistory(url: string): Promise<HistoryPayload> {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`pull request history: ${response.status}`);
    const payload = (await response.json()) as HistoryPayload;
    if (
        !Array.isArray(payload.pullRequests) ||
        !Number.isFinite(payload.allTimeCount) ||
        !Number.isFinite(Date.parse(payload.generatedAt))
    ) {
        throw new Error("pull request history: invalid archive");
    }
    return payload;
}

/** The scheduled news archive is complete; the bundled copy is an explicit fallback. */
export function loadPullRequestHistory() {
    if (historyCache) return historyCache;
    historyCache = (async () => {
        let fallback = false;
        const payload = await fetchHistory(HISTORY_ARCHIVE).catch(() => {
            fallback = true;
            return fetchHistory("/data/community-pr-history.json");
        });
        const uniquePullRequests = new Map(
            payload.pullRequests.map((pullRequest) => [
                pullRequest.number,
                pullRequest,
            ]),
        );
        const pullRequests = [...uniquePullRequests.values()]
            .filter((pullRequest) => pullRequest.date >= NEWS_START_DAY)
            .sort(
                (left, right) =>
                    left.date.localeCompare(right.date) ||
                    left.number - right.number,
            );
        const firstDay = pullRequests[0]?.date;
        const latestDay = pullRequests[pullRequests.length - 1]?.date;
        if (!firstDay || !latestDay) {
            throw new Error("pull request history is empty");
        }
        const byDate = new Map<string, DiaryPr[]>();
        for (const pullRequest of pullRequests) {
            const day = byDate.get(pullRequest.date) ?? [];
            day.push(pullRequest);
            byDate.set(pullRequest.date, day);
        }
        return {
            pullRequests,
            byDate,
            firstDay,
            latestDay,
            allTimeCount: payload.allTimeCount,
            updatedAt: payload.generatedAt,
            fallback,
        };
    })();
    // A failed load must not be cached, or the diary stays broken until reload.
    historyCache.then(
        (history) => {
            if (history.fallback) historyCache = null;
        },
        () => {
            historyCache = null;
        },
    );
    return historyCache;
}

export function usePullRequestCount() {
    return useAsync<number | null>(
        async () => (await loadPullRequestHistory()).allTimeCount,
        null,
    );
}

function addDays(iso: string, amount: number): string {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

function loadDailySummary(date: string) {
    if (date < NEWS_START_DAY) return Promise.resolve(null);
    const existing = summaryCache.get(date);
    if (existing) return existing;
    const request = fetch(`${NEWS_RAW}/${date}/summary.json`)
        .then(async (response) => {
            // Not every calendar day has an entry. Raw GitHub content is
            // CDN-backed and does not consume the API quota.
            if (!response.ok) return null;
            return (await response.json()) as DailySummary;
        })
        .catch(() => null);
    summaryCache.set(date, request);
    return request;
}

function loadMonthlySummary(month: string) {
    const existing = monthlySummaryCache.get(month);
    if (existing) return existing;
    const request = fetch(`${NEWS_MONTHLY_RAW}/${month}/summary.json`)
        .then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as MonthlySummary;
        })
        .catch(() => null);
    monthlySummaryCache.set(month, request);
    return request;
}

function toDiaryDay(date: string, pullRequests: DiaryPr[]): DiaryDay {
    const representative = pullRequests[stableIndex(date, pullRequests.length)];
    if (!representative) {
        return { date, prCount: 0, title: null, summary: null, imageUrl: null };
    }

    return {
        date,
        prCount: pullRequests.length,
        title: representative.title,
        summary: `${pullRequests.length} pull request${pullRequests.length === 1 ? "" : "s"} merged that day, including #${representative.number} from @${representative.author}.`,
        imageUrl:
            FALLBACK_DIARY_IMAGES[
                stableIndex(date, FALLBACK_DIARY_IMAGES.length)
            ],
    };
}

function monthRange(month: string, latestDay: string): string[] {
    const start = `${month}-01`;
    const [year, monthIndex] = month.split("-").map(Number);
    const calendarEnd = new Date(Date.UTC(year, monthIndex, 0))
        .toISOString()
        .slice(0, 10);
    const end = latestDay.startsWith(month) ? latestDay : calendarEnd;
    const days =
        Math.round(
            (new Date(`${end}T00:00:00Z`).getTime() -
                new Date(`${start}T00:00:00Z`).getTime()) /
                86_400_000,
        ) + 1;
    return Array.from({ length: days }, (_, index) => addDays(start, index));
}

export function useBuildDiary(requestedMonth?: string) {
    return useAsync<DiaryRange>(
        async () => {
            const history = await loadPullRequestHistory();
            const newestMonth = history.latestDay.slice(0, 7);
            const month =
                requestedMonth && ISO_MONTH.test(requestedMonth)
                    ? requestedMonth
                    : newestMonth;
            const range = monthRange(month, history.latestDay);
            return {
                month,
                latestDay: history.latestDay,
                updatedAt: history.updatedAt,
                fallback: history.fallback,
                days: range.map((date) =>
                    toDiaryDay(date, history.byDate.get(date) ?? []),
                ),
            };
        },
        { month: "", latestDay: "", days: [], updatedAt: "", fallback: false },
        { key: requestedMonth ?? "latest" },
    );
}

export function useBuildDiaryAll(options?: UseAsyncOptions) {
    return useAsync<DiaryAll>(
        async () => {
            const history = await loadPullRequestHistory();
            const byMonth = new Map<string, DiaryPr[]>();
            for (const pullRequest of history.pullRequests) {
                const month = pullRequest.date.slice(0, 7);
                const pullRequests = byMonth.get(month) ?? [];
                pullRequests.push(pullRequest);
                byMonth.set(month, pullRequests);
            }

            const firstMonth = history.firstDay.slice(0, 7);
            const latestMonth = history.latestDay.slice(0, 7);
            const months: DiaryMonth[] = [];
            const cursor = new Date(`${firstMonth}-01T00:00:00Z`);
            while (cursor.toISOString().slice(0, 7) <= latestMonth) {
                const month = cursor.toISOString().slice(0, 7);
                months.push({
                    month,
                    prCount: byMonth.get(month)?.length ?? 0,
                    title: null,
                    summary: null,
                    imageUrl: null,
                });
                cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            }

            return { months };
        },
        { months: [] },
        options,
    );
}

type DiaryStory =
    | (DiaryDay & { period: "day" })
    | (DiaryMonth & { period: "month" });

/** Load only the story on screen, after its counts and navigation are ready. */
export async function loadBuildDiaryStory(
    month: DiaryMonth | null,
    day: DiaryDay | undefined,
): Promise<DiaryStory | null> {
    if (month) {
        const summary = await loadMonthlySummary(month.month);
        if (summary)
            return {
                ...month,
                title: summary.title,
                summary: summary.summary.split(/\n\s*\n/)[0].trim(),
                imageUrl: `${NEWS_MONTHLY_RAW}/${month.month}/images/cover.jpg`,
                period: "month",
            };
    }
    if (!day) return null;
    const summary = await loadDailySummary(day.date);
    return {
        ...day,
        ...(summary
            ? {
                  title: summary.title,
                  summary: summary.summary.split(/\n\s*\n/)[0].trim(),
                  imageUrl: `${NEWS_RAW}/${day.date}/images/twitter.jpg`,
              }
            : {}),
        period: "day",
    };
}

export function useBuildDiaryStory(
    month: DiaryMonth | null,
    day: DiaryDay | undefined,
) {
    return useAsync(() => loadBuildDiaryStory(month, day), null, {
        enabled: Boolean(month || day),
        key: `${month?.month ?? ""}:${day?.date ?? ""}`,
    });
}

/* ── Supporters ─────────────────────────────────────────────────────────── */

/**
 * Static on purpose: these are sponsorship relationships, not something an
 * API can measure.
 */
export const SUPPORTERS = [
    {
        name: "AWS Activate",
        url: "https://aws.amazon.com/",
        logo: "/supporters/aws.svg",
        description: "GPU cloud credits",
    },
    {
        name: "Google Cloud for Startups",
        url: "https://cloud.google.com/",
        logo: "/supporters/google-cloud.svg",
        description: "GPU cloud credits",
    },
    {
        name: "NVIDIA Inception",
        url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        logo: "/supporters/nvidia.svg",
        description: "AI startup support",
    },
    {
        name: "Azure (MS for Startups)",
        url: "https://azure.microsoft.com/",
        logo: "/supporters/azure.svg",
        description: "OpenAI credits",
    },
    {
        name: "Cloudflare",
        url: "https://developers.cloudflare.com/workers-ai/",
        logo: "/supporters/cloudflare.svg",
        description: "Put the connectivity cloud to work for you",
    },
    {
        name: "Scaleway",
        url: "https://www.scaleway.com/",
        logo: "/supporters/scaleway.svg",
        description: "Europe's empowering cloud provider",
    },
    {
        name: "Modal",
        url: "https://modal.com/",
        logo: "/supporters/modal.svg",
        description: "High-performance AI infrastructure",
    },
    {
        name: "Nebius",
        url: "https://nebius.com/",
        logo: "/supporters/nebius.svg",
        description: "AI-optimised cloud with NVIDIA GPU clusters",
    },
    {
        name: "Perplexity AI",
        url: "https://www.perplexity.ai/",
        logo: "/supporters/perplexity.svg",
        description: "AI-powered search and answer engine",
    },
    {
        name: "io.net",
        url: "https://io.net/",
        logo: "/supporters/io-net.svg",
        description: "Decentralised GPU network for AI compute",
    },
    {
        name: "BytePlus",
        url: "https://www.byteplus.com/",
        logo: "/supporters/byteplus.svg",
        description: "ByteDance cloud services and AI solutions",
    },
    {
        name: "InferencePort AI",
        url: "https://inferenceport.ai/",
        logo: "/supporters/inferenceport.svg",
        description: "Cloud and local AI infrastructure",
    },
] as const;
