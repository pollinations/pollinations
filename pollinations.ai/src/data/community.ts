/**
 * Community signals, all anonymous and all live.
 *
 * Most GitHub feeds are requested anonymously from each visitor's browser.
 * The small header signals use cached same-site endpoints so they remain
 * reliable without credentials. Everything degrades to `failed` and hides
 * rather than showing a stale hardcoded number.
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

type LivePullRequest = Omit<DiaryPr, "date"> & { mergedAt: string };

type HistoryPayload = {
    allTimeCount: number;
    pullRequests: DiaryPr[];
};

type DiaryHistory = {
    pullRequests: DiaryPr[];
    byDate: Map<string, DiaryPr[]>;
    firstDay: string;
    latestDay: string;
    allTimeCount: number;
};

type DiaryRange = {
    month: string;
    latestDay: string;
    days: DiaryDay[];
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

async function loadLivePullRequests(since: string) {
    const query = encodeURIComponent(
        `repo:${REPO} is:pr is:merged merged:>=${since}`,
    );
    const pullRequests: LivePullRequest[] = [];
    let page = 1;
    let total = 1;

    while (pullRequests.length < total && page <= 10) {
        const response = await fetch(
            `${GITHUB}/search/issues?q=${query}&sort=updated&order=asc&per_page=100&page=${page}`,
            { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!response.ok) {
            throw new Error(`recent pull requests: ${response.status}`);
        }
        const result = (await response.json()) as {
            total_count: number;
            items: {
                number: number;
                title: string;
                closed_at: string | null;
                user: { login: string } | null;
            }[];
        };
        total = Math.min(result.total_count, 1_000);
        for (const item of result.items) {
            if (!item.closed_at) continue;
            pullRequests.push({
                number: item.number,
                mergedAt: item.closed_at,
                title: item.title,
                author: item.user?.login ?? "community contributor",
            });
        }
        page += 1;
    }

    return pullRequests;
}

function loadPullRequestHistory() {
    if (historyCache) return historyCache;
    historyCache = (async () => {
        const response = await fetch("/data/community-pr-history.json");
        if (!response.ok) {
            throw new Error(`pull request history: ${response.status}`);
        }
        const payload = (await response.json()) as HistoryPayload;
        const archivedLatest =
            payload.pullRequests[payload.pullRequests.length - 1]?.date;
        const livePullRequests = archivedLatest
            ? await loadLivePullRequests(archivedLatest).catch(() => [])
            : [];
        const uniquePullRequests = new Map(
            payload.pullRequests.map((pullRequest) => [
                pullRequest.number,
                pullRequest,
            ]),
        );
        let liveAdditions = 0;
        for (const pullRequest of livePullRequests) {
            if (!uniquePullRequests.has(pullRequest.number)) liveAdditions += 1;
            uniquePullRequests.set(pullRequest.number, {
                number: pullRequest.number,
                date: pullRequest.mergedAt.slice(0, 10),
                title: pullRequest.title,
                author: pullRequest.author,
            });
        }
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
            allTimeCount: payload.allTimeCount + liveAdditions,
        };
    })();
    // A failed load must not be cached, or the diary stays broken until reload.
    historyCache.catch(() => {
        historyCache = null;
    });
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

function toDiaryDay(
    date: string,
    daily: DailySummary | null,
    pullRequests: DiaryPr[],
): DiaryDay {
    if (daily) {
        return {
            date,
            prCount: pullRequests.length,
            title: daily.title,
            summary: daily.summary.split(/\n\s*\n/)[0].trim(),
            imageUrl: `${NEWS_RAW}/${date}/images/twitter.jpg`,
        };
    }

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
            const dailySummaries = await Promise.all(
                range.map(loadDailySummary),
            );

            return {
                month,
                latestDay: history.latestDay,
                days: range.map((date, index) =>
                    toDiaryDay(
                        date,
                        dailySummaries[index],
                        history.byDate.get(date) ?? [],
                    ),
                ),
            };
        },
        { month: "", latestDay: "", days: [] },
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

            const monthlySummaries = await Promise.all(
                months.map((item) => loadMonthlySummary(item.month)),
            );

            return {
                months: months.map((item, index) => {
                    const monthly = monthlySummaries[index];
                    if (!monthly) return item;
                    return {
                        ...item,
                        title: monthly.title,
                        summary: monthly.summary.split(/\n\s*\n/)[0].trim(),
                        imageUrl: `${NEWS_MONTHLY_RAW}/${item.month}/images/cover.jpg`,
                    };
                }),
            };
        },
        { months: [] },
        options,
    );
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
