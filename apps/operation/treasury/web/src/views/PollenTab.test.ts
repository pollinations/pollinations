import { describe, expect, it } from "vitest";
import type { PollenMonthlyRow } from "../types";
import { aggregatePollenByYear } from "./PollenTab";

const row = (over: Partial<PollenMonthlyRow>): PollenMonthlyRow => ({
    source: "tinybird",
    month: "2026-01",
    vendor: "openai",
    model: "gpt",
    currency: "POLLEN",
    cost_paid: 1,
    cost_quests: 2,
    price_paid: 3,
    price_quests: 4,
    byop_paid: 5,
    byop_quests: 6,
    model_paid: 7,
    model_quests: 8,
    ...over,
});

describe("aggregatePollenByYear", () => {
    it("sums pollen rows by vendor and currency for a year", () => {
        expect(
            aggregatePollenByYear({
                rows: [
                    row({ model: "gpt" }),
                    row({
                        month: "2026-02",
                        model: "dalle",
                        cost_paid: 10,
                        cost_quests: 20,
                        price_paid: 30,
                        price_quests: 40,
                        byop_paid: 50,
                        byop_quests: 60,
                        model_paid: 70,
                        model_quests: 80,
                    }),
                    row({
                        month: "2025-12",
                        cost_paid: 100,
                    }),
                ],
                vendor: "all",
                year: "2026",
            }),
        ).toEqual([
            {
                source: "tinybird",
                month: "2026",
                vendor: "openai",
                model: "all models",
                currency: "POLLEN",
                cost_paid: 11,
                cost_quests: 22,
                price_paid: 33,
                price_quests: 44,
                byop_paid: 55,
                byop_quests: 66,
                model_paid: 77,
                model_quests: 88,
            },
        ]);
    });
});
