import { describe, expect, it } from "vitest";
import type { Data, OpPollenRow } from "../types";
import {
    communityEconomicsRows,
    communityEconomicsSummary,
} from "./communityEconomics";

const pollen = (over: Partial<OpPollenRow> = {}): OpPollenRow => ({
    month: "2026-07",
    vendor: "community",
    model: "community-model",
    currency: "USD",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 100,
    price_quests: 50,
    byop_paid: 5,
    byop_quests: 0,
    model_paid: 75,
    model_quests: 40,
    requests_paid: 10,
    requests_quests: 5,
    ...over,
});

describe("communityEconomicsRows", () => {
    it("keeps only community models and calculates retained paid value", () => {
        const data: Data = {
            opPollen: [
                pollen(),
                pollen({ vendor: "openai", model: "managed-model" }),
            ],
        };

        expect(communityEconomicsRows(data, "2026-07")).toEqual([
            expect.objectContaining({
                model: "community-model",
                paidPollenUsd: 100,
                byopPaidShareUsd: 5,
                ownerPaidShareUsd: 75,
                retainedPaidUsd: 20,
                retainedPct: 20,
                questPollenUsd: 50,
                ownerQuestRewardUsd: 40,
                paidRequests: 10,
                questRequests: 5,
            }),
        ]);
    });

    it("keeps months separate and summary totals additive", () => {
        const rows = communityEconomicsRows(
            {
                opPollen: [
                    pollen(),
                    pollen({
                        month: "2026-08",
                        price_paid: 50,
                        model_paid: 35,
                    }),
                ],
            },
            ["2026-07", "2026-08"],
        );
        const summary = communityEconomicsSummary(rows);

        expect(rows).toHaveLength(2);
        expect(summary).toMatchObject({
            paidPollenUsd: 150,
            byopPaidShareUsd: 10,
            ownerPaidShareUsd: 110,
            retainedPaidUsd: 30,
            retainedPct: 20,
            questPollenUsd: 100,
            ownerQuestRewardUsd: 80,
            paidRequests: 20,
            questRequests: 10,
        });
    });
});
