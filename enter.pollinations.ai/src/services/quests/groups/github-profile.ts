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
 * each GitHub profile is fetched once, then pure threshold checks emit rewards.
 */

const log = getLogger(["enter", "quest", "github-profile"]);

const MAX_REWARDS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type GitHubQuestUserRow = {
    userId: string;
    githubId: number;
    githubUsername: string | null;
};

type GitHubProfileActivity = {
    githubAccountCreatedAt: Date | null;
};

type GitHubProfileResponse = {
    login?: string;
    created_at?: string;
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

/**
 * One-fetch-per-user profile snapshot. Keep this cheap: senior-dev status only
 * needs the account created_at timestamp.
 */
async function fetchGitHubProfileActivity(
    env: CloudflareBindings,
    githubId: number,
): Promise<GitHubProfileActivity | null> {
    const profile = await fetchGitHubProfile(env, githubId);
    if (!profile) return null;
    return { githubAccountCreatedAt: profile.createdAt };
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
    title: "Connect an established GitHub account",
    description:
        "Link a GitHub account that has existed for at least one year. This unlocks automatically after you connect GitHub.",
    category: "build",
    scope: "perUser",
    rewardAmount: 6,
    balanceBucket: "tier",
};

const QUESTS = [establishedGitHubAccountQuest];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const now = new Date();
    const rows = await loadGitHubUsers(ctx.db, MAX_REWARDS_PER_RUN);
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
    }

    return proposals;
}
