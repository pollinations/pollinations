export function buildQuestPayoutKey(
    questIssue: number,
    githubId: number,
    role: string,
): string {
    return `quest:${questIssue}:gh:${githubId}:role:${role}`;
}
