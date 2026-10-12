import { getLogger } from "@logtape/logtape";
import { githubApiHeaders } from "../../github-api.ts";
import { type QuestDefinition, rewardableQuests } from "../definitions.ts";
import type {
    QuestCard,
    QuestEvaluation,
    QuestEvaluationContext,
    QuestUser,
} from "../types.ts";
import { questToCard } from "../types.ts";

/**
 * GitHub profile quests fetch the current user's linked GitHub profile, then
 * pure threshold checks emit rewards.
 */

const log = getLogger(["enter", "quest", "github-profile"]);

const PUBLIC_REPO_STAR_THRESHOLD = 20;

type GitHubProfileResponse = {
    login?: string;
};

type GitHubRepoResponse = {
    fork?: boolean;
    size?: number;
    stargazers_count?: number;
};

async function fetchGitHubProfile(
    env: CloudflareBindings,
    githubId: number,
): Promise<{ login: string | null } | null> {
    log.info("GITHUB_PROFILE_FETCH_START: githubId={githubId}", { githubId });
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: await githubApiHeaders(env),
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
    log.info(
        "GITHUB_PROFILE_FETCH_OK: githubId={githubId} login={login} rateLimitRemaining={rateLimitRemaining} rateLimitReset={rateLimitReset}",
        {
            githubId,
            login: profile.login ?? null,
            rateLimitRemaining,
            rateLimitReset,
        },
    );
    return { login: profile.login ?? null };
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
            { headers: await githubApiHeaders(env) },
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

const establishedGitHubAccountQuest: QuestDefinition = {
    id: "github_established",
    title: "Senior dev",
    description:
        "Sign in with a GitHub account that is at least three years old.",
    category: "contribute",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
    // Retained only so existing rewards remain visible and claimable.
    state: "completed",
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

const EVALUATED_QUESTS = [publicRepoStarsQuest];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function evaluateUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const rewardableQuestIds = new Set(
        rewardableQuests(EVALUATED_QUESTS).map((quest) => quest.id),
    );
    if (rewardableQuestIds.size === 0) {
        log.info(
            "GITHUB_PROFILE_SKIPPED: userId={userId} reason=no_rewardable_quests",
            { userId: user.id },
        );
        return { proposals: [] };
    }

    if (user.githubId === null) {
        log.info(
            "GITHUB_PROFILE_SKIPPED: userId={userId} reason=no_github_id",
            {
                userId: user.id,
            },
        );
        return { proposals: [] };
    }

    const proposals: QuestEvaluation["proposals"] = [];
    const profile = await fetchGitHubProfile(ctx.env, user.githubId);
    if (!profile) {
        log.info(
            "GITHUB_PROFILE_NO_ACTIVITY: userId={userId} githubId={githubId}",
            { userId: user.id, githubId: user.githubId },
        );
        return { proposals };
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

    return { proposals };
}
