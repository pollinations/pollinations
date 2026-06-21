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

type GitHubProfileResponse = {
    login?: string;
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

export async function loadUsersMissingQuestGrant(
    db: QuestDb,
    keyPrefix: string,
    limit: number,
): Promise<GitHubQuestUserRow[]> {
    return db.all<GitHubQuestUserRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId,
            user.github_username AS githubUsername
        FROM user
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${keyPrefix} || user.id
        WHERE user.github_id IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${limit}`,
    );
}

export async function fetchGitHubLogin(
    env: CloudflareBindings,
    githubId: number,
): Promise<string | null> {
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
    return profile.login ?? null;
}

export async function fetchGitHubRepoStats(
    env: CloudflareBindings,
    githubId: number,
): Promise<GitHubRepoStats | null> {
    const githubLogin = await fetchGitHubLogin(env, githubId);
    if (!githubLogin) return null;

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
