/**
 * Anonymous community signals.
 *
 * GitHub feeds, the Discord widget and the Quest leaderboard are requested
 * anonymously from each visitor's browser. Failures surface as `failed`, and live counts hide.
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

/* ── Quests ─────────────────────────────────────────────────────────────── */

export type QuestLeaderboardEntry = {
    githubLogin: string;
    completedQuests: number;
    totalPollen: number;
};

/** Completed GitHub Quest rewards: global totals plus the top contributors. */
export type QuestLeaderboardData = {
    leaderboard: QuestLeaderboardEntry[];
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
