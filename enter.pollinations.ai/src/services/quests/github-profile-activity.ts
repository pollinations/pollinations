import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import type { QuestDb } from "./types.ts";

const log = getLogger(["enter", "quest", "github-profile-activity"]);
const MAX_REPO_PAGES = 3;
const REPOS_PER_PAGE = 100;

export type GitHubQuestUserRow = {
    userId: string;
    githubId: number;
    githubUsername: string | null;
};

export type GitHubRepoStats = {
    githubLogin: string;
    qualityRepoCount: number;
    qualityRepoStars: number;
    fetchedRepoCount: number;
};

/**
 * Combined per-user GitHub profile snapshot: the account `created_at` plus
 * aggregate repo stats. One profile fetch + one repo paging pass, so a single
 * call can drive all three github-profile thresholds (account age, repo count,
 * repo stars) without re-fetching the profile per threshold.
 */
export type GitHubProfileActivity = GitHubRepoStats & {
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

export function githubApiHeaders(
    env: CloudflareBindings,
): Record<string, string> {
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
 * Source loader for the github-profile group: every user with a linked GitHub
 * account, capped. Reward dedup is handled downstream by excludeExistingRewards
 * (one fetch per user fans out to all three thresholds), so this does NOT
 * LEFT JOIN reward_grants per quest.
 */
export async function loadGitHubUsers(
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

export async function fetchGitHubProfile(
    env: CloudflareBindings,
    githubId: number,
): Promise<{ login: string | null; createdAt: Date | null } | null> {
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubApiHeaders(env),
    });
    if (!response.ok) {
        log.warn(
            "GITHUB_PROFILE_FETCH_FAILED: githubId={githubId} status={status}",
            {
                githubId,
                status: response.status,
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
    return { login: profile.login ?? null, createdAt };
}

async function fetchGitHubRepoStatsForLogin(
    env: CloudflareBindings,
    githubId: number,
    githubLogin: string,
): Promise<GitHubRepoStats | null> {
    let qualityRepoCount = 0;
    let qualityRepoStars = 0;
    let fetchedRepoCount = 0;

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
                {
                    githubId,
                    githubLogin,
                    status: response.status,
                },
            );
            return null;
        }

        const repos = (await response.json()) as GitHubRepoResponse[];
        fetchedRepoCount += repos.length;
        for (const repo of repos) {
            if (repo.fork || !repo.size) continue;
            qualityRepoCount += 1;
            qualityRepoStars += repo.stargazers_count ?? 0;
        }
        if (repos.length < REPOS_PER_PAGE) break;
    }

    return {
        githubLogin,
        qualityRepoCount,
        qualityRepoStars,
        fetchedRepoCount,
    };
}

/**
 * One-fetch-per-user profile snapshot: a single profile read (login +
 * created_at) followed by a single repo paging pass. Drives all three
 * github-profile thresholds from one call.
 */
export async function fetchGitHubProfileActivity(
    env: CloudflareBindings,
    githubId: number,
): Promise<GitHubProfileActivity | null> {
    const profile = await fetchGitHubProfile(env, githubId);
    if (!profile?.login) return null;

    const stats = await fetchGitHubRepoStatsForLogin(
        env,
        githubId,
        profile.login,
    );
    if (!stats) return null;

    return { ...stats, githubAccountCreatedAt: profile.createdAt };
}
