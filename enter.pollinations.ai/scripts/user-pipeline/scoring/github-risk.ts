/**
 * GitHub profile risk assessment for seed eligibility.
 *
 * This module is intentionally separate from the numeric developer score.
 * It flags suspicious GitHub profile construction patterns that should block a
 * seed promotion while still allowing the user to remain at spore.
 */

const RECENT_EMPTY_REPO_WINDOW_DAYS = 7;
const BURST_EMPTY_REPO_THRESHOLD = 5;
const EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS = 20;
const EMPTY_REPO_DOMINANCE_THRESHOLD = 0.8;
const MIN_QUALITY_REPOS_FOR_LARGE_ACCOUNT = 3;

interface RepoNode {
    diskUsage?: number;
    createdAt?: string;
    stargazerCount?: number;
}

interface RepositoriesData {
    totalCount?: number;
    nodes?: Array<RepoNode | null>;
}

export interface RiskResult {
    username: string;
    risk_status: "ok" | "suspicious" | "unavailable";
    risk_flags: string[];
    risk_details: {
        total_repos: number;
        fetched_repos: number;
        empty_fetched_repos: number;
        quality_fetched_repos: number;
        recent_empty_repos: number;
    } | null;
}

function parseGithubDatetime(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    try {
        return new Date(value);
    } catch {
        return null;
    }
}

export function assessProfileRisk(
    data: { repositories?: RepositoriesData } | null,
    username: string,
): RiskResult {
    if (!data) {
        return {
            username,
            risk_status: "unavailable",
            risk_flags: [],
            risk_details: null,
        };
    }

    const repositories = data.repositories ?? {};
    const allNodes = (repositories.nodes ?? []).filter(
        (node): node is RepoNode => node !== null,
    );
    const emptyNodes = allNodes.filter((node) => (node.diskUsage ?? 0) === 0);
    const qualityNodes = allNodes.filter(
        (node) => (node.diskUsage ?? 0) > 0,
    );
    const totalRepos = Number(repositories.totalCount ?? 0);

    const recentCutoff = new Date(
        Date.now() - RECENT_EMPTY_REPO_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    let recentEmptyRepos = 0;
    for (const node of emptyNodes) {
        const createdAt = parseGithubDatetime(node.createdAt);
        if (createdAt && createdAt >= recentCutoff) {
            recentEmptyRepos++;
        }
    }

    const flags: string[] = [];
    const fetchedRepos = allNodes.length;
    const emptyRatio = fetchedRepos > 0 ? emptyNodes.length / fetchedRepos : 0;

    if (recentEmptyRepos >= BURST_EMPTY_REPO_THRESHOLD) {
        flags.push("burst_empty_repos");
    }
    if (
        totalRepos > EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS &&
        fetchedRepos > 0 &&
        emptyRatio > EMPTY_REPO_DOMINANCE_THRESHOLD
    ) {
        flags.push("empty_repo_dominance");
    }
    if (
        totalRepos > EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS &&
        qualityNodes.length < MIN_QUALITY_REPOS_FOR_LARGE_ACCOUNT
    ) {
        flags.push("repo_quality_gap");
    }

    return {
        username,
        risk_status: flags.length > 0 ? "suspicious" : "ok",
        risk_flags: flags,
        risk_details: {
            total_repos: totalRepos,
            fetched_repos: fetchedRepos,
            empty_fetched_repos: emptyNodes.length,
            quality_fetched_repos: qualityNodes.length,
            recent_empty_repos: recentEmptyRepos,
        },
    };
}
