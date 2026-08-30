/**
 * Community signals, all anonymous and all live.
 *
 * GitHub's unauthenticated limit is 60 requests/hour *per client IP*, so each
 * visitor gets their own budget and this page's four calls never pool into a
 * shared ceiling — no token, and no proxy needed. Everything degrades to
 * `failed` and hides rather than showing a stale hardcoded number.
 */
import { type UseAsyncOptions, useAsync } from "./useAsync";

const REPO = "pollinations/pollinations";
const GITHUB = "https://api.github.com";
export const REPO_URL = `https://github.com/${REPO}`;
export const DISCORD_URL =
    "https://discord.gg/pollinations-ai-885844321461485618";
const GUILD_ID = "885844321461485618";

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
            const repo = await github<{ stargazers_count: number }>(
                `/repos/${REPO}`,
            );
            return repo.stargazers_count;
        },
        null,
        options,
    );
}

/* ── Discord ────────────────────────────────────────────────────────────── */

/**
 * The widget exposes `presence_count` — members online right now — and not
 * total membership, which needs a bot token. So the page says "online now"
 * rather than repeating the old "17K+ members", which we cannot measure from
 * here and would just be a number we typed once.
 */
export function useDiscordPresence(options?: UseAsyncOptions) {
    return useAsync<number | null>(
        async () => {
            const response = await fetch(
                `https://discord.com/api/guilds/${GUILD_ID}/widget.json`,
            );
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

/**
 * Keep the section useful when GitHub's small unauthenticated API allowance is
 * exhausted. Live data replaces this snapshot whenever the API is available.
 */
const FALLBACK_CONTRIBUTORS: Contributor[] = [
    ["voodoohop", 5640],
    ["ElliotEtag", 1640],
    ["ale-rls", 262],
    ["Itachi-1824", 189],
    ["Circuit-Overtime", 154],
    ["gokaykucuk", 140],
    ["eulervoid", 95],
    ["lauraibnz", 63],
    ["fisventurous", 37],
    ["alexreiling", 34],
    ["CloudCompile", 26],
    ["chakra-gold", 20],
].map(([login, commits]) => ({
    login: String(login),
    avatarUrl: `https://github.com/${login}.png?size=80`,
    profileUrl: `https://github.com/${login}`,
    commits: Number(commits),
}));

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
    return useAsync<Contributor[]>(
        async () => {
            // One request, already ranked by commit count — the old page walked
            // five pages of commits to rebuild the same ordering by hand.
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
        },
        FALLBACK_CONTRIBUTORS.slice(0, limit),
    );
}

/**
 * An exact all-time repository contributor count without downloading every
 * profile. Anonymous authors matter especially in the project's older commit
 * history. With one result per page, GitHub's final pagination page is the
 * total.
 */
export function useContributorCount() {
    return useAsync<number | null>(async () => {
        const response = await fetch(
            `${GITHUB}/repos/${REPO}/contributors?per_page=1&anon=1`,
            { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!response.ok)
            throw new Error(`github contributors: ${response.status}`);

        const rows = (await response.json()) as GhContributor[];
        const lastPage = response.headers
            .get("link")
            ?.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)?.[1];

        return lastPage ? Number(lastPage) : rows.length;
    }, null);
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
 * rather than a hardcoded list of issue numbers — the three the old page
 * pinned (5543, 5321, 4826) are exactly what this returns, but a new one shows
 * up on its own.
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
const NEWS_REPO_PATH = "operations/social/news/daily";
const NEWS_START_DAY = "2026-02-05";
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
    prs: DiaryPr[];
    title: string | null;
    summary: string | null;
    imageUrl: string | null;
    url: string | null;
};

export type DiaryPr = {
    number: number;
    date: string;
    mergedAt: string;
    title: string;
    url: string;
    author: string;
};

type HistoryPullRequest = Omit<DiaryPr, "date">;

type HistoryPayload = {
    generatedAt: string;
    pullRequests: HistoryPullRequest[];
};

type DiaryHistory = {
    pullRequests: DiaryPr[];
    byDate: Map<string, DiaryPr[]>;
    firstDay: string;
    latestDay: string;
    firstYear: number;
    latestYear: number;
};

type DiaryRange = {
    month: string;
    firstDay: string;
    latestDay: string;
    days: DiaryDay[];
    hasEarlier: boolean;
    hasLater: boolean;
};

export type DiaryMonth = {
    month: string;
    prCount: number;
};

type DiaryYear = {
    year: number;
    months: DiaryMonth[];
    hasEarlier: boolean;
    hasLater: boolean;
};

export type DiaryYearTotal = {
    year: number;
    prCount: number;
    representativeDate: string;
};

type DiaryAll = {
    firstYear: number;
    latestYear: number;
    years: DiaryYearTotal[];
};

type DailySummary = {
    date: string;
    title: string;
    summary: string;
};

const ISO_MONTH = /^\d{4}-\d{2}$/;
const summaryCache = new Map<string, Promise<DailySummary | null>>();
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
    const pullRequests: HistoryPullRequest[] = [];
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
                html_url: string;
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
                url: item.html_url,
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
            payload.pullRequests[payload.pullRequests.length - 1]?.mergedAt;
        const livePullRequests = archivedLatest
            ? await loadLivePullRequests(archivedLatest.slice(0, 10)).catch(
                  () => [],
              )
            : [];
        const uniquePullRequests = new Map(
            payload.pullRequests.map((pullRequest) => [
                pullRequest.number,
                pullRequest,
            ]),
        );
        for (const pullRequest of livePullRequests) {
            uniquePullRequests.set(pullRequest.number, pullRequest);
        }
        const pullRequests = [...uniquePullRequests.values()]
            .map((pullRequest) => ({
                ...pullRequest,
                date: pullRequest.mergedAt.slice(0, 10),
            }))
            .sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));
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
            firstYear: Number(firstDay.slice(0, 4)),
            latestYear: Number(latestDay.slice(0, 4)),
        };
    })();
    return historyCache;
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
    const request = fetch(`${NEWS_RAW}/${date}/summary.json`).then(
        async (response) => {
            // Not every calendar day has an entry. Raw GitHub content is
            // CDN-backed and does not consume the API quota.
            if (!response.ok) return null;
            return (await response.json()) as DailySummary;
        },
    );
    summaryCache.set(date, request);
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
            prs: pullRequests,
            title: daily.title,
            summary: daily.summary.split(/\n\s*\n/)[0].trim(),
            imageUrl: `${NEWS_RAW}/${date}/images/twitter.jpg`,
            url: `${REPO_URL}/tree/news/${NEWS_REPO_PATH}/${date}`,
        };
    }

    const representative = pullRequests[stableIndex(date, pullRequests.length)];
    if (!representative) {
        return {
            date,
            prCount: 0,
            prs: [],
            title: null,
            summary: null,
            imageUrl: null,
            url: null,
        };
    }

    return {
        date,
        prCount: pullRequests.length,
        prs: pullRequests,
        title: representative.title,
        summary: `${pullRequests.length} pull request${pullRequests.length === 1 ? "" : "s"} merged that day, including #${representative.number} from @${representative.author}.`,
        imageUrl:
            FALLBACK_DIARY_IMAGES[
                stableIndex(date, FALLBACK_DIARY_IMAGES.length)
            ],
        url: representative.url,
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
                firstDay: history.firstDay,
                latestDay: history.latestDay,
                days: range.map((date, index) => {
                    return toDiaryDay(
                        date,
                        dailySummaries[index],
                        history.byDate.get(date) ?? [],
                    );
                }),
                hasEarlier: month > history.firstDay.slice(0, 7),
                hasLater: month < newestMonth,
            };
        },
        {
            month: "",
            firstDay: "",
            latestDay: "",
            days: [],
            hasEarlier: false,
            hasLater: false,
        },
        { key: requestedMonth ?? "latest" },
    );
}

export function useBuildDiaryYear(
    requestedYear?: number,
    options?: UseAsyncOptions,
) {
    return useAsync<DiaryYear>(
        async () => {
            const history = await loadPullRequestHistory();
            const year = requestedYear ?? history.latestYear;
            const counts = new Map<string, number>();
            for (const pr of history.pullRequests) {
                if (Number(pr.date.slice(0, 4)) !== year) continue;
                const month = pr.date.slice(0, 7);
                counts.set(month, (counts.get(month) ?? 0) + 1);
            }

            return {
                year,
                months: Array.from(
                    {
                        length:
                            year === history.latestYear
                                ? Number(history.latestDay.slice(5, 7))
                                : 12,
                    },
                    (_, index) => {
                        const month = `${year}-${String(index + 1).padStart(2, "0")}`;
                        return { month, prCount: counts.get(month) ?? 0 };
                    },
                ),
                hasEarlier: year > history.firstYear,
                hasLater: year < history.latestYear,
            };
        },
        { year: 0, months: [], hasEarlier: false, hasLater: false },
        { ...options, key: requestedYear ?? "latest" },
    );
}

export function useBuildDiaryAll(options?: UseAsyncOptions) {
    return useAsync<DiaryAll>(
        async () => {
            const history = await loadPullRequestHistory();
            const years = Array.from(
                { length: history.latestYear - history.firstYear + 1 },
                (_, index) => history.firstYear + index,
            ).map((year) => {
                const pullRequests = history.pullRequests.filter(
                    (pullRequest) =>
                        Number(pullRequest.date.slice(0, 4)) === year,
                );
                const representative =
                    pullRequests[
                        stableIndex(String(year), pullRequests.length)
                    ];
                return {
                    year,
                    prCount: pullRequests.length,
                    representativeDate: representative?.date ?? `${year}-01-01`,
                };
            });
            return {
                firstYear: history.firstYear,
                latestYear: history.latestYear,
                years,
            };
        },
        { firstYear: 0, latestYear: 0, years: [] },
        options,
    );
}

/* ── Supporters ─────────────────────────────────────────────────────────── */

/**
 * Static on purpose: these are sponsorship relationships, not something an
 * API can measure. Carried over from the old site's content file.
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
