import { describe, expect, test } from "vitest";
import { buildQuestPayoutKey } from "../src/tier-progression/shared/quest-payout-key.ts";

describe("quest payout idempotency", () => {
    test("keys payouts by quest, immutable github id, and role", () => {
        expect(buildQuestPayoutKey(123, 456, "assignee")).toBe(
            "quest:123:gh:456:role:assignee",
        );
    });
});
