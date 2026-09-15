export const QUEST_STATUS_UPDATED_EVENT = "pollinations:quest-status-updated";

type Quest = { id: string; state: string };
type Reward = { questId: string | null; claimedAt: string | null };

export function questNavLabel(
    quests: readonly Quest[],
    rewards: readonly Reward[],
): string | null {
    const claimable = rewards.filter(
        (reward) => reward.claimedAt == null,
    ).length;
    if (claimable > 0) return `${claimable} claimable!`;

    const completed = new Set(
        rewards
            .map((reward) => reward.questId)
            .filter((id): id is string => id != null),
    );
    const available = quests.filter(
        (quest) => quest.state === "available" && !completed.has(quest.id),
    ).length;
    return available > 0 ? `${available} new!` : null;
}
