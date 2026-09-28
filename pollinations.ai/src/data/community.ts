/**
 * Anonymous community signals and a daily refreshed build-history archive.
 *
 * Most GitHub feeds are requested anonymously from each visitor's browser.
 * The small header signals use cached same-site endpoints so they remain
 * reliable without credentials. Failures surface as `failed`; the page shows
 * what could not load, and live counts hide. The diary labels its archive
 * timestamp and explicitly identifies the bundled snapshot during an outage.
 */
import { cachePublic } from "./cachePublic";
import { type UseAsyncOptions, useAsync } from "./useAsync";

const REPO = "pollinations/pollinations";
const GITHUB = "https://api.github.com";
export const REPO_URL = `https://github.com/${REPO}`;
export const DISCORD_URL =
    "https://discord.gg/pollinations-ai-885844321461485618";

const loadGithub = cachePublic(async (path: string): Promise<unknown> => {
    const response = await fetch(`${GITHUB}${path}`, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`github ${path}: ${response.status}`);
    return response.json();
});

/* ── Stars ──────────────────────────────────────────────────────────────── */

const loadRepoStars = cachePublic(async () => {
    const response = await fetch("/api/github-stars");
    if (!response.ok) throw new Error(`github: ${response.status}`);
    const repo = (await response.json()) as {
        stargazers_count?: number;
    };
    if (typeof repo.stargazers_count !== "number") return null;
    return repo.stargazers_count;
});

export function useRepoStars() {
    return useAsync(loadRepoStars, null);
}

/* ── Discord ────────────────────────────────────────────────────────────── */

/**
 * The widget exposes `presence_count` — members online right now — and not
 * total membership, which needs a bot token. The website worker proxies this
 * public value because Discord's widget response does not allow browser CORS.
 */
export const loadDiscordPresence = cachePublic(async () => {
    const response = await fetch("/api/discord-presence");
    if (!response.ok) throw new Error(`discord: ${response.status}`);
    const widget = (await response.json()) as {
        presence_count?: number;
    };
    return widget.presence_count ?? null;
});

export function useDiscordPresence(options?: UseAsyncOptions) {
    return useAsync(loadDiscordPresence, null, options);
}

/* ── Contributors ───────────────────────────────────────────────────────── */

type Contributor = {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    commits: number;
};

type GhContributor = {
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
    type?: string;
};

export function useContributors() {
    return useAsync<Contributor[]>(async () => {
        // One request, already ranked by commit count.
        const rows = (await loadGithub(
            `/repos/${REPO}/contributors?per_page=20`,
        )) as GhContributor[];
        return rows
            .filter((row) => row.type !== "Bot")
            .slice(0, 12)
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
    reactions: number;
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
        reactions: { total_count: number };
    }[];
};

export async function loadVotingIssues(limit = 3): Promise<VotingIssue[]> {
    const query = encodeURIComponent(
        `repo:${REPO} is:issue is:open "${VOTE_MARKER}" in:title`,
    );
    const found = (await loadGithub(
        `/search/issues?q=${query}&sort=reactions&order=desc&per_page=${limit}`,
    )) as GhSearch;
    return found.items.map((item) => ({
        number: item.number,
        title: item.title.replace(VOTE_MARKER, "").trim(),
        url: item.html_url,
        // Each emoji represents a different answer; these are not unique voters.
        reactions: item.reactions.total_count,
    }));
}

export function useVotingIssues() {
    return useAsync(loadVotingIssues, []);
}

/* ── Build diary ────────────────────────────────────────────────────────── */

const NEWS_RAW =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/daily";
const NEWS_MONTHLY_RAW =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/monthly";
const FALLBACK_DIARY_IMAGES = [
    "2026-08-03",
    "2026-08-05",
    "2026-08-14",
    "2026-08-23",
    "2026-08-28",
].map((date) => `${NEWS_RAW}/${date}/images/twitter.jpg`);

type DiaryDay = {
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

type DiaryMonth = {
    month: string;
    prCount: number;
};

type DiaryAll = {
    months: DiaryMonth[];
};

let historyCache: Promise<DiaryHistory> | null = null;

export function stableIndex(value: string, length: number) {
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
        const pullRequests = [...payload.pullRequests].sort(
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

/**
 * A day or month summary, trimmed to its first paragraph. Not every period has
 * one. Raw GitHub content is CDN-backed and does not consume the API quota.
 */
const loadSummary = cachePublic(async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const { title, summary } = (await response.json()) as {
            title: string;
            summary: string;
        };
        return { title, summary: summary.split(/\n\s*\n/)[0].trim() };
    } catch {
        return null;
    }
});

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
    const [year, monthIndex] = month.split("-").map(Number);
    const lastDay = latestDay.startsWith(month)
        ? Number(latestDay.slice(8, 10))
        : new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    return Array.from(
        { length: lastDay },
        (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    );
}

export function useBuildDiary(requestedMonth?: string) {
    return useAsync<DiaryRange>(
        async () => {
            const history = await loadPullRequestHistory();
            const month = requestedMonth || history.latestDay.slice(0, 7);
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

export function useBuildDiaryAll() {
    return useAsync<DiaryAll>(
        async () => {
            const history = await loadPullRequestHistory();
            const counts = new Map<string, number>();
            for (const { date } of history.pullRequests) {
                const month = date.slice(0, 7);
                counts.set(month, (counts.get(month) ?? 0) + 1);
            }

            const firstMonth = history.firstDay.slice(0, 7);
            const latestMonth = history.latestDay.slice(0, 7);
            const months: DiaryMonth[] = [];
            const cursor = new Date(`${firstMonth}-01T00:00:00Z`);
            while (cursor.toISOString().slice(0, 7) <= latestMonth) {
                const month = cursor.toISOString().slice(0, 7);
                months.push({ month, prCount: counts.get(month) ?? 0 });
                cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            }

            return { months };
        },
        { months: [] },
    );
}

type DiaryStory =
    | (DiaryDay & { period: "day" })
    | (DiaryMonth & {
          title: string;
          summary: string;
          imageUrl: string;
          period: "month";
      });

/** Load only the story on screen, after its counts and navigation are ready. */
export async function loadBuildDiaryStory(
    month: DiaryMonth | null,
    day: DiaryDay | undefined,
): Promise<DiaryStory | null> {
    if (month) {
        const summary = await loadSummary(
            `${NEWS_MONTHLY_RAW}/${month.month}/summary.json`,
        );
        if (summary)
            return {
                ...month,
                ...summary,
                imageUrl: `${NEWS_MONTHLY_RAW}/${month.month}/images/cover.jpg`,
                period: "month",
            };
    }
    if (!day) return null;
    const summary = await loadSummary(`${NEWS_RAW}/${day.date}/summary.json`);
    return {
        ...day,
        ...(summary && {
            ...summary,
            imageUrl: `${NEWS_RAW}/${day.date}/images/twitter.jpg`,
        }),
        period: "day",
    };
}

export function useBuildDiaryStory(
    month: DiaryMonth | null,
    day: DiaryDay | undefined,
) {
    return useAsync(() => loadBuildDiaryStory(month, day), null, {
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
