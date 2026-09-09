import { describe, expect, it } from "vitest";
import { questNavLabel } from "../frontend/src/components/quests/quest-nav-status.ts";

const available = (id: string) => ({ id, state: "available" });
const reward = (questId: string | null, claimedAt: string | null) => ({
    questId,
    claimedAt,
});

describe("questNavLabel", () => {
    it("prioritizes rewards ready to claim", () => {
        expect(
            questNavLabel(
                [available("new-quest")],
                [reward("done", null), reward("other", null)],
            ),
        ).toBe("2 claimable!");
    });

    it("counts available quests the account has not completed", () => {
        expect(
            questNavLabel(
                [
                    available("done"),
                    available("new-1"),
                    available("new-2"),
                    { id: "later", state: "coming_soon" },
                ],
                [reward("done", "2026-09-09T00:00:00Z")],
            ),
        ).toBe("2 new");
    });

    it("hides the badge when nothing needs attention", () => {
        expect(
            questNavLabel(
                [available("done")],
                [reward("done", "2026-09-09T00:00:00Z")],
            ),
        ).toBeNull();
    });
});
