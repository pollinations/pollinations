import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import type {
    Quest,
    QuestAward,
    QuestDb,
    QuestEvaluationContext,
} from "../types.ts";

/**
 * github-profile group: three threshold quests read off ONE GitHub profile
 * snapshot per user (account age, public repo count, repo stars). Each is a
 * self-contained quest with its own findRewards, but they MUST share one
 * GitHub fetch per user per run — fetching the profile three times would
 * triple the rate-limited GitHub API calls. The shared fetch is a per-run memo
 * keyed by the evaluation ctx (runQuestEvaluator builds a fresh ctx each run),
 * so the cache is automatically scoped to a single run and garbage-collected
 * when the run ends — no clock, no stale data across cron runs.
 *
 * This file owns both the GitHub/D1 I/O (loadGitHubUsers +
 * fetchGitHubProfileActivity below) and the quests that consume it — they have
 * no other caller, so they live together.
 */

const log = getLogger(["enter", "quest", "github-profile"]);

const MAX_GRANTS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REPO_THRESHOLD = 2;
const STAR_THRESHOLD = 50;
const MAX_REPO_PAGES = 3;
const REPOS_PER_PAGE = 100;

type GitHubQuestUserRow = {
    userId: string;
    githubId: number;
    githubUsername: string | null;
};

/**
 * Combined per-user GitHub profile snapshot: the account `created_at` plus
 * aggregate repo stats. One profile fetch + one repo paging pass, so a single
 * call can drive all three thresholds (account age, repo count, repo stars)
 * without re-fetching the profile per threshold.
 */
type GitHubProfileActivity = {
    qualityRepoCount: number;
    qualityRepoStars: number;
    githubAccountCreatedAt: Date | null;
};

type GitHubProfileResponse = {
    login?: string;
    created_at?: string;
};

type GitHubRepoResponse = {
    fork?: boolean;
    size?: number;
    stargazers_count?: number;
};

function githubApiHeaders(env: CloudflareBindings): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "pollinations-enter",
    };
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
    }
    return headers;
}

/**
 * Source loader: every user with a linked GitHub account, capped. Reward dedup
 * is handled downstream by grantReward's idempotent insert (one fetch per user
 * fans out to all three thresholds), so this does NOT LEFT JOIN reward_grants
 * per quest.
 */
async function loadGitHubUsers(
    db: QuestDb,
    limit: number,
): Promise<GitHubQuestUserRow[]> {
    return db.all<GitHubQuestUserRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId,
            user.github_username AS githubUsername
        FROM user
        WHERE user.github_id IS NOT NULL
        LIMIT ${limit}`,
    );
}

async function fetchGitHubProfile(
    env: CloudflareBindings,
    githubId: number,
): Promise<{ login: string | null; createdAt: Date | null } | null> {
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubApiHeaders(env),
    });
    if (!response.ok) {
        log.warn(
            "GITHUB_PROFILE_FETCH_FAILED: githubId={githubId} status={status}",
            { githubId, status: response.status },
        );
        return null;
    }

    const profile = (await response.json()) as GitHubProfileResponse;
    let createdAt: Date | null = null;
    if (profile.created_at) {
        const parsed = new Date(profile.created_at);
        createdAt = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return { login: profile.login ?? null, createdAt };
}

async function fetchGitHubRepoStats(
    env: CloudflareBindings,
    githubId: number,
    githubLogin: string,
): Promise<{ qualityRepoCount: number; qualityRepoStars: number } | null> {
    let qualityRepoCount = 0;
    let qualityRepoStars = 0;

    for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
        const url = new URL(
            `https://api.github.com/users/${githubLogin}/repos`,
        );
        url.searchParams.set("type", "owner");
        url.searchParams.set("per_page", String(REPOS_PER_PAGE));
        url.searchParams.set("page", String(page));

        const response = await fetch(url.toString(), {
            headers: githubApiHeaders(env),
        });
        if (!response.ok) {
            log.warn(
                "GITHUB_REPOS_FETCH_FAILED: githubId={githubId} githubLogin={githubLogin} status={status}",
                { githubId, githubLogin, status: response.status },
            );
            return null;
        }

        const repos = (await response.json()) as GitHubRepoResponse[];
        for (const repo of repos) {
            if (repo.fork || !repo.size) continue;
            qualityRepoCount += 1;
            qualityRepoStars += repo.stargazers_count ?? 0;
        }
        if (repos.length < REPOS_PER_PAGE) break;
    }

    return { qualityRepoCount, qualityRepoStars };
}

/**
 * One-fetch-per-user profile snapshot: a single profile read (login +
 * created_at) followed by a single repo paging pass. Drives all three
 * thresholds from one call.
 */
async function fetchGitHubProfileActivity(
    env: CloudflareBindings,
    githubId: number,
): Promise<GitHubProfileActivity | null> {
    const profile = await fetchGitHubProfile(env, githubId);
    if (!profile?.login) return null;

    const stats = await fetchGitHubRepoStats(env, githubId, profile.login);
    if (!stats) return null;

    return { ...stats, githubAccountCreatedAt: profile.createdAt };
}

/**
 * Per-run profile memo: one fetch per githubId, shared across all three quests
 * in a single evaluation. Keyed by ctx so it lives exactly as long as the run
 * — runQuestEvaluator creates a fresh ctx per invocation, and the WeakMap entry
 * is collected when that ctx goes out of scope.
 */
const profileMemoByRun = new WeakMap<
    QuestEvaluationContext,
    Map<number, Promise<GitHubProfileActivity | null>>
>();

function loadProfile(
    ctx: QuestEvaluationContext,
    githubId: number,
): Promise<GitHubProfileActivity | null> {
    let memo = profileMemoByRun.get(ctx);
    if (!memo) {
        memo = new Map();
        profileMemoByRun.set(ctx, memo);
    }
    let pending = memo.get(githubId);
    if (!pending) {
        pending = fetchGitHubProfileActivity(ctx.env, githubId);
        memo.set(githubId, pending);
    }
    return pending;
}

function accountAgeDays(activity: GitHubProfileActivity, now: Date): number {
    if (!activity.githubAccountCreatedAt) return -1;
    return Math.floor(
        (now.getTime() - activity.githubAccountCreatedAt.getTime()) /
            MS_PER_DAY,
    );
}

/**
 * Connect a GitHub account at least one year old. scope:"perUser" — toGrant
 * derives the key `quest:onboarding:established_github_account:user:${userId}`,
 * BYTE-IDENTICAL to the legacy value.
 */
const establishedGitHubAccountQuest: Quest = {
    id: "onboarding:established_github_account",
    title: "Claim senior dev status",
    description: "Connect a GitHub account that is at least one year old.",
    iconId: "github",
    category: "plant",
    scope: "perUser",
    rewardAmount: 6,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const now = new Date();
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.githubAccountCreatedAt === null) continue;
            if (accountAgeDays(activity, now) < GITHUB_ACCOUNT_AGE_DAYS) {
                continue;
            }
            awards.push({ userId: row.userId });
        }
        return awards;
    },
};

/**
 * Have at least 2 non-empty public GitHub repos. scope:"perUser" — toGrant
 * derives `quest:engage:github_2_public_repos:user:${userId}`, BYTE-IDENTICAL
 * to the legacy value.
 */
const githubPublicReposQuest: Quest = {
    id: "engage:github_2_public_repos",
    title: "Publish 2 public repos",
    description: "Have at least 2 non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.qualityRepoCount < REPO_THRESHOLD) continue;
            awards.push({ userId: row.userId });
        }
        return awards;
    },
};

/**
 * Earn 50 stars across non-empty public GitHub repos. scope:"perUser" —
 * toGrant derives `quest:engage:github_50_repo_stars:user:${userId}`,
 * BYTE-IDENTICAL to the legacy value.
 */
const githubRepoStarsQuest: Quest = {
    id: "engage:github_50_repo_stars",
    title: "Earn 50 GitHub stars",
    description:
        "Earn 50 stars across your non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "pack",
    async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
        const awards: QuestAward[] = [];
        for (const row of rows) {
            const activity = await loadProfile(ctx, row.githubId);
            if (!activity) continue;
            if (activity.qualityRepoStars < STAR_THRESHOLD) continue;
            awards.push({ userId: row.userId });
        }
        return awards;
    },
};

export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [
        establishedGitHubAccountQuest,
        githubPublicReposQuest,
        githubRepoStarsQuest,
    ];
}
