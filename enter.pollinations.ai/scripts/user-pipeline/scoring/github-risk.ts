const RECENT_EMPTY_REPO_WINDOW_DAYS = 7;
const BURST_EMPTY_REPO_THRESHOLD = 5;
const EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS = 20;
const EMPTY_REPO_DOMINANCE_THRESHOLD = 0.8;
const MIN_QUALITY_REPOS_FOR_LARGE_ACCOUNT = 3;

interface GitHubRepositoryNode {
    stargazerCount?: number | null;
    diskUsage?: number | null;
    createdAt?: string | null;
}

interface GitHubRiskInput {
    repositories?: {
        totalCount?: number | null;
        nodes?: Array<GitHubRepositoryNode | null> | null;
    } | null;
}

export interface GitHubRiskResult {
    github_id: number | null;
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

function parseGitHubDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assessProfileRisk(
    data: GitHubRiskInput | null,
    githubId: number | null,
): GitHubRiskResult {
    if (!data) {
        return {
            github_id: githubId,
            risk_status: "unavailable",
            risk_flags: [],
            risk_details: null,
        };
    }

    const repositories = data.repositories ?? {};
    const allNodes = (repositories.nodes ?? []).filter(
        (node): node is GitHubRepositoryNode => Boolean(node),
    );
    const emptyNodes = allNodes.filter((node) => (node.diskUsage ?? 0) === 0);
    const qualityNodes = allNodes.filter((node) => (node.diskUsage ?? 0) > 0);
    const totalRepos = Number(repositories.totalCount ?? 0);
    const cutoff =
        Date.now() - RECENT_EMPTY_REPO_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    let recentEmptyRepos = 0;
    for (const node of emptyNodes) {
        const createdAt = parseGitHubDate(node.createdAt ?? null);
        if (createdAt && createdAt.getTime() >= cutoff) {
            recentEmptyRepos += 1;
        }
    }

    const flags: string[] = [];
    const fetchedRepos = allNodes.length;
    const emptyRatio =
        fetchedRepos === 0 ? 0 : emptyNodes.length / fetchedRepos;

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
        github_id: githubId,
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
