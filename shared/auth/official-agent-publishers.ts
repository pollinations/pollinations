/** GitHub user IDs whose published agents receive the verified catalog chip. */
export const OFFICIAL_AGENT_PUBLISHER_GITHUB_IDS: readonly number[] = [
    240205932, // pollinations-router
    241978997, // pollen-router
];

export function isOfficialAgentPublisherGithubId(
    githubId: number | null | undefined,
): boolean {
    return (
        typeof githubId === "number" &&
        Number.isInteger(githubId) &&
        githubId > 0 &&
        OFFICIAL_AGENT_PUBLISHER_GITHUB_IDS.includes(githubId)
    );
}
