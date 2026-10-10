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

/** GitHub's contributor list: all-time commits on main, people and agents alike. */
type Contributor = {
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
};

export function useContributors() {
    // One request, already ranked by commit count.
    return useAsync<Contributor[]>(
        async () =>
            (await loadGithub(
                `/repos/${REPO}/contributors?per_page=20`,
            )) as Contributor[],
        [],
    );
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

/**
 * Every merged pull request on any branch, by anyone. Release pull requests
 * into production are left out: they copy work already merged into main.
 */
export function usePullRequestCount() {
    return useAsync<number | null>(
        async () =>
            (
                await searchGithub(
                    "is:pr is:merged -base:production",
                    "per_page=1",
                )
            ).total_count,
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
 * API can measure. Alphabetical; logos follow the model registry's publisher
 * style (24px box, ink fitted to the middle 20px, currentColor).
 */
export const SUPPORTERS = [
    {
        name: "Alibaba Cloud",
        url: "https://www.alibabacloud.com/",
        logo: "/supporters/alibaba.svg",
    },
    {
        name: "Anthropic",
        url: "https://www.anthropic.com/",
        logo: "/supporters/anthropic.svg",
    },
    {
        name: "AssemblyAI",
        url: "https://www.assemblyai.com/",
        logo: "/supporters/assemblyai.svg",
    },
    {
        name: "AWS",
        url: "https://aws.amazon.com/",
        logo: "/supporters/aws.svg",
    },
    {
        name: "BytePlus",
        url: "https://www.byteplus.com/",
        logo: "/supporters/byteplus.svg",
    },
    {
        name: "Cloudflare",
        url: "https://developers.cloudflare.com/workers-ai/",
        logo: "/supporters/cloudflare.svg",
    },
    {
        name: "Daytona",
        url: "https://www.daytona.io/",
        logo: "/supporters/daytona.svg",
    },
    {
        name: "DigitalOcean",
        url: "https://www.digitalocean.com/",
        logo: "/supporters/digitalocean.svg",
    },
    { name: "E2B", url: "https://e2b.dev/", logo: "/supporters/e2b.svg" },
    {
        name: "ElevenLabs",
        url: "https://elevenlabs.io/",
        logo: "/supporters/elevenlabs.svg",
    },
    { name: "Exa", url: "https://exa.ai/", logo: "/supporters/exa.svg" },
    {
        name: "Fireworks AI",
        url: "https://fireworks.ai/",
        logo: "/supporters/fireworks.svg",
    },
    {
        name: "Google Cloud",
        url: "https://cloud.google.com/",
        logo: "/supporters/google-cloud.svg",
    },
    {
        name: "InferencePort AI",
        url: "https://inferenceport.ai/",
        logo: "/supporters/inferenceport.svg",
    },
    { name: "io.net", url: "https://io.net/", logo: "/supporters/io-net.svg" },
    {
        name: "Lambda",
        url: "https://lambda.ai/",
        logo: "/supporters/lambda.svg",
    },
    {
        name: "Microsoft Azure",
        url: "https://azure.microsoft.com/",
        logo: "/supporters/azure.svg",
    },
    { name: "Modal", url: "https://modal.com/", logo: "/supporters/modal.svg" },
    {
        name: "Nebius",
        url: "https://nebius.com/",
        logo: "/supporters/nebius.svg",
    },
    {
        name: "NVIDIA",
        url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        logo: "/supporters/nvidia.svg",
    },
    {
        name: "OpenAI",
        url: "https://openai.com/",
        logo: "/supporters/openai.svg",
    },
    {
        name: "OpenRouter",
        url: "https://openrouter.ai/",
        logo: "/supporters/openrouter.svg",
    },
    {
        name: "OVHcloud",
        url: "https://www.ovhcloud.com/",
        logo: "/supporters/ovhcloud.svg",
    },
    {
        name: "Perplexity",
        url: "https://www.perplexity.ai/",
        logo: "/supporters/perplexity.svg",
    },
    {
        name: "RunPod",
        url: "https://www.runpod.io/",
        logo: "/supporters/runpod.svg",
    },
    {
        name: "Scaleway",
        url: "https://www.scaleway.com/",
        logo: "/supporters/scaleway.svg",
    },
] as const;
