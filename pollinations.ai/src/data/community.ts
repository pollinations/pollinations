/**
 * Anonymous community signals.
 *
 * GitHub feeds, the Discord widget and the Quest leaderboard are requested
 * anonymously from each visitor's browser. Failures surface as `failed`, and
 * live counts hide.
 */
import { cachePublic } from "./cachePublic";
import { type UseAsyncOptions, useAsync } from "./useAsync";

const REPO = "pollinations/pollinations";
const GITHUB = "https://api.github.com";
const DISCORD_WIDGET =
    "https://discord.com/api/guilds/885844321461485618/widget.json";

const loadGithub = cachePublic(async (path: string): Promise<unknown> => {
    const response = await fetch(`${GITHUB}${path}`, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`github ${path}: ${response.status}`);
    return response.json();
});

/* ── Stars ──────────────────────────────────────────────────────────────── */

async function loadRepoStars() {
    const repo = (await loadGithub(`/repos/${REPO}`)) as {
        stargazers_count?: number;
    };
    return repo.stargazers_count ?? null;
}

export function useRepoStars() {
    return useAsync(loadRepoStars, null);
}

/* ── Discord ────────────────────────────────────────────────────────────── */

/**
 * The widget exposes `presence_count` — members online right now — and not
 * total membership, which needs a bot token. Discord echoes the requesting
 * origin in its CORS header without `Vary: Origin`, so a browser-cached copy
 * fetched from www.pollinations.ai would fail on pollinations.ai. Discord's
 * edge caches it anyway.
 */
export const loadDiscordPresence = cachePublic(async () => {
    const response = await fetch(DISCORD_WIDGET, { cache: "no-store" });
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
    avatar_url: string;
    html_url: string;
    contributions: number;
    type: string;
};

export function useContributors() {
    return useAsync<Contributor[]>(async () => {
        // One request, already ranked by commit count.
        const rows = (await loadGithub(
            `/repos/${REPO}/contributors?per_page=20`,
        )) as Contributor[];
        return rows.filter((row) => row.type !== "Bot").slice(0, 12);
    }, []);
}

/* ── Pull requests and open votes ───────────────────────────────────────── */

type GhSearch = {
    total_count: number;
    items: {
        number: number;
        title: string;
        html_url: string;
        reactions: { total_count: number };
    }[];
};

const searchGithub = (query: string, params: string) =>
    loadGithub(
        `/search/issues?q=${encodeURIComponent(`repo:${REPO} ${query}`)}&${params}`,
    ) as Promise<GhSearch>;

export function usePullRequestCount() {
    return useAsync<number | null>(
        async () =>
            (await searchGithub("is:pr is:merged", "per_page=1")).total_count,
        null,
    );
}

/**
 * Maintainers mark these by prefixing the title, so that marker is the filter
 * rather than a hardcoded list of issue numbers: a new one shows up on its own.
 */
const VOTE_MARKER = "[Voting Issue]";

export async function loadVotingIssues(limit = 3) {
    const found = await searchGithub(
        `is:issue is:open "${VOTE_MARKER}" in:title`,
        `sort=reactions&order=desc&per_page=${limit}`,
    );
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

/* ── Quests ─────────────────────────────────────────────────────────────── */

/** Completed GitHub Quest rewards: global totals plus the top contributors. */
export type QuestLeaderboardData = {
    leaderboard: {
        githubLogin: string;
        completedQuests: number;
        totalPollen: number;
    }[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

const loadQuestLeaderboard = cachePublic(async () => {
    const response = await fetch(
        "https://enter.pollinations.ai/api/quests/leaderboard",
        { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`quests: ${response.status}`);
    return (await response.json()) as QuestLeaderboardData;
});

export function useQuestLeaderboard() {
    return useAsync<QuestLeaderboardData | null>(loadQuestLeaderboard, null);
}

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
