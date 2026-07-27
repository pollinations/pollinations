/**
 * Community signals, all anonymous and all live.
 *
 * GitHub's unauthenticated limit is 60 requests/hour *per client IP*, so each
 * visitor gets their own budget and this page's four calls never pool into a
 * shared ceiling — no token, and no proxy needed. Everything degrades to
 * `failed` and hides rather than showing a stale hardcoded number.
 */
import { useAsync } from "./useAsync";

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

export function useRepoStars() {
    return useAsync<number | null>(async () => {
        const repo = await github<{ stargazers_count: number }>(
            `/repos/${REPO}`,
        );
        return repo.stargazers_count;
    }, null);
}

/* ── Discord ────────────────────────────────────────────────────────────── */

/**
 * The widget exposes `presence_count` — members online right now — and not
 * total membership, which needs a bot token. So the page says "online now"
 * rather than repeating the old "17K+ members", which we cannot measure from
 * here and would just be a number we typed once.
 */
export function useDiscordPresence() {
    return useAsync<number | null>(async () => {
        const response = await fetch(
            `https://discord.com/api/guilds/${GUILD_ID}/widget.json`,
        );
        if (!response.ok) throw new Error(`discord: ${response.status}`);
        const widget = (await response.json()) as { presence_count?: number };
        return widget.presence_count ?? null;
    }, null);
}

/* ── Contributors ───────────────────────────────────────────────────────── */

export type Contributor = {
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
    }, []);
}

/* ── Open votes ─────────────────────────────────────────────────────────── */

export type VotingIssue = {
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

export type DiaryEntry = { date: string; summary: string; url: string };

type GhCommit = {
    sha: string;
    html_url: string;
    commit: { message: string; author: { date: string } };
};

/** "2026-07-26" -> "26 JUL", the mockup's narrow pixel date column. */
function shortDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getUTCDate()} ${date
        .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
        .toUpperCase()}`;
}

export function useBuildDiary(limit = 5) {
    return useAsync<DiaryEntry[]>(async () => {
        const commits = await github<GhCommit[]>(
            `/repos/${REPO}/commits?per_page=${limit}`,
        );
        return commits.map((commit) => ({
            date: shortDate(commit.commit.author.date),
            // First line only — bodies carry co-author trailers and noise.
            summary: commit.commit.message.split("\n")[0],
            url: commit.html_url,
        }));
    }, []);
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
        description: "GPU cloud credits",
    },
    {
        name: "Google Cloud for Startups",
        url: "https://cloud.google.com/",
        description: "GPU cloud credits",
    },
    {
        name: "NVIDIA Inception",
        url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        description: "AI startup support",
    },
    {
        name: "Azure (MS for Startups)",
        url: "https://azure.microsoft.com/",
        description: "OpenAI credits",
    },
    {
        name: "Cloudflare",
        url: "https://developers.cloudflare.com/workers-ai/",
        description: "Put the connectivity cloud to work for you",
    },
    {
        name: "Scaleway",
        url: "https://www.scaleway.com/",
        description: "Europe's empowering cloud provider",
    },
    {
        name: "Modal",
        url: "https://modal.com/",
        description: "High-performance AI infrastructure",
    },
    {
        name: "Nebius",
        url: "https://nebius.com/",
        description: "AI-optimised cloud with NVIDIA GPU clusters",
    },
    {
        name: "Perplexity AI",
        url: "https://www.perplexity.ai/",
        description: "AI-powered search and answer engine",
    },
    {
        name: "io.net",
        url: "https://io.net/",
        description: "Decentralised GPU network for AI compute",
    },
    {
        name: "BytePlus",
        url: "https://www.byteplus.com/",
        description: "ByteDance cloud services and AI solutions",
    },
] as const;
