import { getLogger } from "@logtape/logtape";
import type { QuestDefinition } from "../definitions.ts";
import type {
    QuestCard,
    QuestEvaluationContext,
    QuestUser,
    RewardProposal,
} from "../types.ts";
import { questToCard } from "../types.ts";

/**
 * GitHub profile quests fetch the current user's linked GitHub profile, then
 * pure threshold checks emit rewards.
 */

const log = getLogger(["enter", "quest", "github-profile"]);

const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

async function fetchGitHubProfile(
    env: CloudflareBindings,
    githubId: number,
): Promise<{ login: string | null; createdAt: Date | null } | null> {
    log.info("GITHUB_PROFILE_FETCH_START: githubId={githubId}", { githubId });
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubApiHeaders(env),
    });
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");
    if (!response.ok) {
        log.warn(
            "GITHUB_PROFILE_FETCH_FAILED: githubId={githubId} status={status} rateLimitRemaining={rateLimitRemaining} rateLimitReset={rateLimitReset}",
            {
                githubId,
                status: response.status,
                rateLimitRemaining,
                rateLimitReset,
            },
        );
        return null;
    }

    const profile = (await response.json()) as GitHubProfileResponse;
    let createdAt: Date | null = null;
    if (profile.created_at) {
        const parsed = new Date(profile.created_at);
        createdAt = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    log.info(
        "GITHUB_PROFILE_FETCH_OK: githubId={githubId} login={login} createdAtRaw={createdAtRaw} createdAt={createdAt} rateLimitRemaining={rateLimitRemaining} rateLimitReset={rateLimitReset}",
        {
            githubId,
            login: profile.login ?? null,
            createdAtRaw: profile.created_at ?? null,
            createdAt: createdAt?.toISOString() ?? null,
            rateLimitRemaining,
            rateLimitReset,
        },
    );
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
    title: "Link an established GitHub account",
    description:
        "Sign in with a GitHub account that is at least one year old. This unlocks automatically after your account is connected.",
    category: "contribute",
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

export async function findRewardProposalsForUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    if (user.githubId === null) {
        log.info(
            "GITHUB_PROFILE_SKIPPED: userId={userId} reason=no_github_id",
            {
                userId: user.id,
            },
        );
        return [];
    }

    const now = new Date();
    const proposals: RewardProposal[] = [];
    const activity = await fetchGitHubProfileActivity(ctx.env, user.githubId);
    if (!activity) {
        log.info(
            "GITHUB_PROFILE_NO_ACTIVITY: userId={userId} githubId={githubId}",
            { userId: user.id, githubId: user.githubId },
        );
        return proposals;
    }

    const ageDays = accountAgeDays(activity, now);
    const qualifies =
        activity.githubAccountCreatedAt !== null &&
        ageDays >= GITHUB_ACCOUNT_AGE_DAYS;
    log.info(
        "GITHUB_PROFILE_QUEST_DECISION: userId={userId} githubId={githubId} createdAt={createdAt} ageDays={ageDays} thresholdDays={thresholdDays} qualifies={qualifies}",
        {
            userId: user.id,
            githubId: user.githubId,
            createdAt: activity.githubAccountCreatedAt?.toISOString() ?? null,
            ageDays,
            thresholdDays: GITHUB_ACCOUNT_AGE_DAYS,
            qualifies,
        },
    );

    if (qualifies) {
        proposals.push({
            quest: establishedGitHubAccountQuest,
            userId: user.id,
        });
    }

    return proposals;
}
