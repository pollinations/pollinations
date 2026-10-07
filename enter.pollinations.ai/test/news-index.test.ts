import { describe, expect, it } from "vitest";
import {
    cardDetails,
    type ModelNews,
    visibleModelNews,
} from "../frontend/src/components/news-faq/news-index.ts";

function news(overrides: Partial<ModelNews>): ModelNews {
    return {
        id: "pr-1:example/model",
        model_id: "example/model",
        title: "Example",
        action: "UPDATE",
        category: "text",
        date: "2026-10-06",
        scheduled: false,
        pr: 1,
        url: "https://github.com/pollinations/pollinations/pull/1",
        changes: {},
        ...overrides,
    };
}

describe("model news cards", () => {
    it("shows only the changed price lines, balance and capabilities", () => {
        const details = cardDetails(
            news({
                changes: {
                    pricing: {
                        before: {
                            currency: "pollen",
                            promptTextTokens: "0.0000001",
                            completionTextTokens: "0.000001",
                        },
                        after: {
                            currency: "pollen",
                            promptTextTokens: "0.00000001",
                            completionTextTokens: "0.000001",
                        },
                    },
                    paid_only: { before: false, after: true },
                    per_user_rpm: { before: null, after: 8 },
                },
            }),
        );
        expect(details).toEqual([
            {
                label: "Price",
                before: "Text in $0.1/M",
                after: "$0.01/M",
            },
            {
                label: "Balance",
                before: "Quest or Paid Pollen",
                after: "Paid Pollen only",
            },
            {
                label: "Capability",
                before: "Rate limit: none",
                after: "8 requests/min per user",
            },
        ]);
    });

    it("uses the billing unit /models uses, not the pricing field name", () => {
        const [price] = cardDetails(
            news({
                action: "NEW",
                category: "audio",
                changes: {
                    pricing: {
                        before: null,
                        after: {
                            currency: "pollen",
                            completionAudioTokens: "0.000022",
                        },
                    },
                    paid_only: { before: null, after: true },
                },
            }),
        );
        expect(price).toEqual({
            label: "Price",
            after: "Audio out $0.022/K chars",
        });
    });

    it("shows retirements without details", () => {
        expect(cardDetails(news({ action: "RETIRE" }))).toEqual([]);
    });

    it("keeps changes from 7 days back to 30 days ahead", () => {
        const dates = ["2026-09-30", "2026-10-01", "2026-11-07", "2026-11-08"];
        expect(
            visibleModelNews(
                dates.map((date) => news({ id: date, date })),
                "2026-10-08",
            ).map(({ date }) => date),
        ).toEqual(["2026-10-01", "2026-11-07"]);
    });
});
