export const QUEST_STATUS_UPDATED_EVENT = "pollinations:quest-status-updated";

type Quest = { id: string; state: string; category?: string };
type Reward = { questId: string | null; claimedAt: string | null };

/** `held`: the account's Setup rewards are locked, so they aren't claimable. */
export function questNavLabel(
    quests: readonly Quest[],
    rewards: readonly Reward[],
    held = false,
): string | null {
    const locked = new Set(
        held
            ? quests
                  .filter((quest) => quest.category === "setup")
                  .map((quest) => quest.id)
            : [],
    );
    const claimable = rewards.filter(
        (reward) =>
            reward.claimedAt == null && !locked.has(reward.questId ?? ""),
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
