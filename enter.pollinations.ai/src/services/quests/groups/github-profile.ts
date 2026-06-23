import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import type {
    QuestCard,
    QuestDb,
    QuestEvaluationContext,
    RewardProposal,
} from "../types.ts";
import { questToCard } from "../types.ts";

/**
 * GitHub profile quests share one source scan: linked users are loaded from D1,
 * each GitHub profile is fetched once, then pure threshold checks emit reward
 * proposals.
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

function accountAgeDays(activity: GitHubProfileActivity, now: Date): number {
    if (!activity.githubAccountCreatedAt) return -1;
    return Math.floor(
        (now.getTime() - activity.githubAccountCreatedAt.getTime()) /
            MS_PER_DAY,
    );
}

const establishedGitHubAccountQuest: QuestDefinition = {
    id: "onboarding:established_github_account",
    title: "Claim senior dev status",
    description: "Connect a GitHub account that is at least one year old.",
    iconId: "github",
    category: "plant",
    scope: "perUser",
    rewardAmount: 6,
    balanceBucket: "pack",
};

const githubPublicReposQuest: QuestDefinition = {
    id: "engage:github_2_public_repos",
    title: "Publish 2 public repos",
    description: "Have at least 2 non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
};

const githubRepoStarsQuest: QuestDefinition = {
    id: "engage:github_50_repo_stars",
    title: "Earn 50 GitHub stars",
    description:
        "Earn 50 stars across your non-empty public GitHub repositories.",
    iconId: "github",
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "pack",
};

const QUESTS = [
    establishedGitHubAccountQuest,
    githubPublicReposQuest,
    githubRepoStarsQuest,
];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const now = new Date();
    const rows = await loadGitHubUsers(ctx.db, MAX_GRANTS_PER_RUN);
    const proposals: RewardProposal[] = [];

    for (const row of rows) {
        const activity = await fetchGitHubProfileActivity(
            ctx.env,
            row.githubId,
        );
        if (!activity) continue;

        if (
            activity.githubAccountCreatedAt !== null &&
            accountAgeDays(activity, now) >= GITHUB_ACCOUNT_AGE_DAYS
        ) {
            proposals.push({
                quest: establishedGitHubAccountQuest,
                userId: row.userId,
            });
        }
        if (activity.qualityRepoCount >= REPO_THRESHOLD) {
            proposals.push({
                quest: githubPublicReposQuest,
                userId: row.userId,
            });
        }
        if (activity.qualityRepoStars >= STAR_THRESHOLD) {
            proposals.push({ quest: githubRepoStarsQuest, userId: row.userId });
        }
    }

    return proposals;
}
