export const QUEST_STATUS_UPDATED_EVENT = "pollinations:quest-status-updated";

type Quest = { id: string; state: string; category?: string };
type Reward = { questId: string | null; claimedAt: string | null };

/** A held account's Setup quests: their rewards can't be claimed. */
export function lockedQuestIds(
    quests: readonly Quest[],
    held: boolean,
): Set<string> {
    return new Set(
        held
            ? quests
                  .filter((quest) => quest.category === "setup")
                  .map((quest) => quest.id)
            : [],
    );
}

export function questNavLabel(
    quests: readonly Quest[],
    rewards: readonly Reward[],
    held = false,
): string | null {
    const locked = lockedQuestIds(quests, held);
    const claimable = rewards.filter(
        (reward) =>
            reward.claimedAt == null && !locked.has(reward.questId ?? ""),
    ).length;
    if (claimable > 0) return `${claimable} claimable`;

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
