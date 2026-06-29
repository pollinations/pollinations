import { getLogger } from "@logtape/logtape";
import { githubOAuthAppHeaders } from "@shared/github/api.ts";
import { type QuestDefinition, rewardableQuests } from "../definitions.ts";
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
const PUBLIC_REPO_STAR_THRESHOLD = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type GitHubProfileResponse = {
    login?: string;
    created_at?: string;
};

type GitHubRepoResponse = {
    fork?: boolean;
    size?: number;
    stargazers_count?: number;
};

async function fetchGitHubProfile(
    env: CloudflareBindings,
    githubId: number,
): Promise<{ login: string | null; createdAt: Date | null } | null> {
    log.info("GITHUB_PROFILE_FETCH_START: githubId={githubId}", { githubId });
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubOAuthAppHeaders(env),
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

async function fetchPublicRepoStars(
    env: CloudflareBindings,
    login: string,
): Promise<number | null> {
    let page = 1;
    let stars = 0;
    let reposChecked = 0;
    let skippedForks = 0;
    let skippedEmpty = 0;

    while (true) {
        log.info("GITHUB_REPOS_FETCH_START: login={login} page={page}", {
            login,
            page,
        });
        const response = await fetch(
            `https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&per_page=100&page=${page}`,
            { headers: githubOAuthAppHeaders(env) },
        );
        const rateLimitRemaining = response.headers.get(
            "x-ratelimit-remaining",
        );
        const rateLimitReset = response.headers.get("x-ratelimit-reset");
        if (!response.ok) {
            log.warn(
                "GITHUB_REPOS_FETCH_FAILED: login={login} page={page} status={status} rateLimitRemaining={rateLimitRemaining} rateLimitReset={rateLimitReset}",
                {
                    login,
                    page,
                    status: response.status,
                    rateLimitRemaining,
                    rateLimitReset,
                },
            );
            return null;
        }

        const repos = (await response.json()) as GitHubRepoResponse[];
        for (const repo of repos) {
            if (repo.fork === true) {
                skippedForks++;
                continue;
            }
            if ((repo.size ?? 0) <= 0) {
                skippedEmpty++;
                continue;
            }
            reposChecked++;
            stars += repo.stargazers_count ?? 0;
        }
        if (repos.length < 100) {
            log.info(
                "GITHUB_REPOS_FETCH_OK: login={login} pages={pages} reposChecked={reposChecked} skippedForks={skippedForks} skippedEmpty={skippedEmpty} stars={stars} rateLimitRemaining={rateLimitRemaining} rateLimitReset={rateLimitReset}",
                {
                    login,
                    pages: page,
                    reposChecked,
                    skippedForks,
                    skippedEmpty,
                    stars,
                    rateLimitRemaining,
                    rateLimitReset,
                },
            );
            return stars;
        }
        page++;
    }
}

function accountAgeDays(createdAt: Date | null, now: Date): number {
    if (!createdAt) return -1;
    return Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY);
}

const establishedGitHubAccountQuest: QuestDefinition = {
    id: "github_established",
    title: "Established GitHub account",
    description: "Sign in with a GitHub account that is at least one year old.",
    category: "contribute",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const publicRepoStarsQuest: QuestDefinition = {
    id: "github_stars",
    title: "Earn over 20 GitHub stars",
    description:
        "The sum of stars across your public repositories is more than 20.",
    category: "contribute",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const QUESTS = [establishedGitHubAccountQuest, publicRepoStarsQuest];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposalsForUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const rewardableQuestIds = new Set(
        rewardableQuests(QUESTS).map((quest) => quest.id),
    );
    if (rewardableQuestIds.size === 0) {
        log.info(
            "GITHUB_PROFILE_SKIPPED: userId={userId} reason=no_rewardable_quests",
            { userId: user.id },
        );
        return [];
    }

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
    const profile = await fetchGitHubProfile(ctx.env, user.githubId);
    if (!profile) {
        log.info(
            "GITHUB_PROFILE_NO_ACTIVITY: userId={userId} githubId={githubId}",
            { userId: user.id, githubId: user.githubId },
        );
        return proposals;
    }

    if (rewardableQuestIds.has(establishedGitHubAccountQuest.id)) {
        const ageDays = accountAgeDays(profile.createdAt, now);
        const qualifies =
            profile.createdAt !== null && ageDays >= GITHUB_ACCOUNT_AGE_DAYS;
        log.info(
            "GITHUB_PROFILE_QUEST_DECISION: userId={userId} githubId={githubId} createdAt={createdAt} ageDays={ageDays} thresholdDays={thresholdDays} qualifies={qualifies}",
            {
                userId: user.id,
                githubId: user.githubId,
                createdAt: profile.createdAt?.toISOString() ?? null,
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
    }

    if (rewardableQuestIds.has(publicRepoStarsQuest.id)) {
        const login = profile.login ?? user.githubUsername;
        const publicRepoStars = login
            ? await fetchPublicRepoStars(ctx.env, login)
            : null;
        const starsQualify =
            publicRepoStars !== null &&
            publicRepoStars > PUBLIC_REPO_STAR_THRESHOLD;
        log.info(
            "GITHUB_PROFILE_STARS_QUEST_DECISION: userId={userId} githubId={githubId} stars={stars} threshold={threshold} qualifies={qualifies}",
            {
                userId: user.id,
                githubId: user.githubId,
                stars: publicRepoStars,
                threshold: PUBLIC_REPO_STAR_THRESHOLD,
                qualifies: starsQualify,
            },
        );

        if (starsQualify) {
            proposals.push({
                quest: publicRepoStarsQuest,
                userId: user.id,
            });
        }
    }

    return proposals;
}
