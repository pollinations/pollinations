import {
    mergeQuestRewards,
    type QuestReward,
} from "@frontend/components/quests/quest-rewards.ts";
import { describe, expect, it } from "vitest";

const pending: QuestReward = {
    id: "reward-a",
    questId: "quest-a",
    title: "First reward",
    pollenAmount: 3,
    balanceBucket: "tier",
    earnedAt: "2026-09-23T10:00:00Z",
    claimedAt: null,
    url: "/quests",
};
const claimed: QuestReward = {
    ...pending,
    claimedAt: "2026-09-23T10:01:00Z",
};

describe("quest refresh during a claim", () => {
    it("keeps a confirmed claim when an older background snapshot arrives", () => {
        const newReward = { ...pending, id: "reward-b", pollenAmount: 2 };
        const result = mergeQuestRewards([claimed], [pending, newReward]);

        expect(result).toEqual([claimed, newReward]);
        expect(result.filter((reward) => reward.claimedAt == null)).toEqual([
            newReward,
        ]);
        expect(
            result
                .filter((reward) => reward.claimedAt != null)
                .reduce((sum, reward) => sum + reward.pollenAmount, 0),
        ).toBe(3);
    });

    it("accepts claims completed elsewhere from the refreshed snapshot", () => {
        expect(mergeQuestRewards([pending], [claimed])).toEqual([claimed]);
    });

    it("retains confirmed rewards absent from an older snapshot", () => {
        expect(mergeQuestRewards([claimed], [])).toEqual([claimed]);
    });
});
