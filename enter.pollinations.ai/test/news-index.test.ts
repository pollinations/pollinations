import { describe, expect, it } from "vitest";
import {
    apiDetails,
    cardDetails,
    type ModelNews,
    newsHighlights,
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
                before: "quest",
                after: "paid",
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
                category: "audio",
                changes: {
                    pricing: {
                        before: {
                            currency: "pollen",
                            completionAudioTokens: "0.0000115",
                        },
                        after: {
                            currency: "pollen",
                            completionAudioTokens: "0.000015",
                        },
                    },
                },
            }),
        );
        expect(price).toEqual({
            label: "Price",
            before: "Audio out $0.0115/K chars",
            after: "$0.015/K chars",
        });
    });

    it("summarises prices that all moved by the same factor", () => {
        const pricing = (scale: number) => ({
            currency: "pollen",
            promptTextTokens: String(0.0000001 * scale),
            completionTextTokens: String(0.0000004 * scale),
        });
        const change = (after: number) =>
            cardDetails(
                news({
                    changes: {
                        pricing: { before: pricing(1), after: pricing(after) },
                    },
                }),
            );
        expect(change(1.055)).toEqual([
            { label: "Price", before: "All prices", after: "+5.5%" },
        ]);
        // A line that moved differently gets its own row; the rest stay grouped.
        const pricing3 = (scale: number, audio: string) => ({
            ...pricing(scale),
            promptAudioTokens: audio,
        });
        expect(
            cardDetails(
                news({
                    changes: {
                        pricing: {
                            before: pricing3(1, "0.0000003"),
                            after: pricing3(1 / 1.055, "0.0000001"),
                        },
                    },
                }),
            ),
        ).toEqual([
            { label: "Price", before: "Audio in $0.3/M", after: "$0.1/M" },
            { label: "Price", before: "Other prices", after: "−5.2%" },
        ]);
    });

    it("shows a replacement behind an alias and its voice changes", () => {
        const details = cardDetails(
            news({
                changes: {
                    model_id: { before: "old/tts", after: "new/tts" },
                    voices: {
                        before: ["cherry", "serena"],
                        after: ["serena", "loong"],
                    },
                },
            }),
        );
        expect(details).toEqual([
            {
                label: "Model",
                after: "replaces old/tts · old ID still works",
            },
            { label: "Voices", before: "removed cherry", after: "added loong" },
        ]);
    });

    it("shows a moved or withdrawn retirement date", () => {
        const moved = news({
            action: "RETIRE",
            status: "scheduled",
            date: "2026-12-01",
            previous_date: "2026-10-20",
        });
        expect(cardDetails(moved)).toEqual([
            { label: "Date", before: "Oct 20", after: "Dec 1" },
        ]);
        expect(
            cardDetails({ ...moved, status: "cancelled", date: "2026-10-08" }),
        ).toEqual([{ label: "Date", before: "Oct 20", after: "cancelled" }]);
    });

    it("shows a new model's prices and Quest/Paid access", () => {
        expect(
            cardDetails(
                news({
                    action: "NEW",
                    changes: {
                        pricing: {
                            before: null,
                            after: {
                                currency: "pollen",
                                promptTextTokens: "0.00000068",
                            },
                        },
                        paid_only: { before: null, after: true },
                    },
                }),
            ),
        ).toEqual([
            { label: "Price", after: "Text in $0.68/M" },
            { label: "Balance", after: "paid" },
        ]);
    });

    it("leaves highlights the Changelog already lists out of News", () => {
        const highlight = (title: string, extra = {}) => ({
            date: "2026-10-07",
            title,
            text: "",
            ...extra,
        });
        expect(
            newsHighlights({
                models: [news({ pr: 10 })],
                api: [],
                highlights: [
                    highlight("model launch", { prs: [10] }),
                    highlight("feature", { prs: [11] }),
                    highlight("app", { prs: [12], app: true }),
                    highlight("older, no PR numbers"),
                ],
            }).map(({ title }) => title),
        ).toEqual(["feature", "older, no PR numbers"]);
    });

    it("puts the endpoint summary first in the API row details", () => {
        expect(
            apiDetails({
                id: "pr-1:GET /models/stats",
                endpoint: "GET /models/stats",
                summary: "Model Usage Stats",
                action: "ADD",
                breaking: false,
                changes: [],
                date: "2026-10-08",
                pr: 1,
                url: "https://github.com/pollinations/pollinations/pull/1",
            }),
        ).toEqual([{ label: "Summary", after: "Model Usage Stats" }]);
    });

    it("shows retirements without details", () => {
        expect(cardDetails(news({ action: "RETIRE" }))).toEqual([]);
    });

    it("keeps changes from 30 days back to 30 days ahead", () => {
        const dates = ["2026-09-07", "2026-09-08", "2026-11-07", "2026-11-08"];
        expect(
            visibleModelNews(
                dates.map((date) => news({ id: date, date })),
                "2026-10-08",
            ).map(({ date }) => date),
        ).toEqual(["2026-09-08", "2026-11-07"]);
    });
});
