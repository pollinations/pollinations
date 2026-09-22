export type QuestReward = {
    id: string;
    questId: string | null;
    title: string;
    pollenAmount: number;
    balanceBucket: string;
    earnedAt: string;
    claimedAt: string | null;
    url?: string | null;
};

/** A background snapshot may predate a successful claim; claiming is final. */
export function mergeQuestRewards(
    current: QuestReward[],
    refreshed: QuestReward[],
): QuestReward[] {
    const rewards = new Map(refreshed.map((reward) => [reward.id, reward]));
    for (const reward of current) {
        if (reward.claimedAt != null) {
            rewards.set(reward.id, reward);
        }
    }
    return [...rewards.values()];
}
