import { describe, expect, it } from "vitest";
import type { Data, RevenueShareSourceRow } from "../types";
import {
    creatorSettlementRows,
    revenueShareLedgerRows,
    revenueShareRows,
    revenueShareSummary,
} from "./revenueShareEconomics";

const share = (
    over: Partial<RevenueShareSourceRow> = {},
): RevenueShareSourceRow => ({
    row_type: "creator",
    month: "2026-07",
    recipient_id: "developer-1",
    github_username: "developer-one",
    recipient_name: "Developer One",
    sources_json: JSON.stringify([
        ["app", "app-1", "App One", "openai"],
        ["app", "app-1", "App One", "flux"],
        ["model", "community/model-1", "community/model-1", "model-1"],
    ]),
    paid_usage: 100,
    paid_creator_earnings: 35,
    paid_pollinations_profit: 45,
    quest_usage: 50,
    quest_creator_earnings: 15,
    paid_requests: 10,
    quest_requests: 5,
    ...over,
});

describe("revenueShareRows", () => {
    it("returns one developer row with its apps and models", () => {
        const rows = revenueShareRows({ revenueShare: [share()] }, "2026-07");

        expect(rows).toEqual([
            expect.objectContaining({
                recipientId: "developer-1",
                githubUsername: "developer-one",
                recipientName: "Developer One",
                appCount: 1,
                modelCount: 1,
                paidUsageUsd: 100,
                paidCreatorEarningsUsd: 35,
                paidPollinationsProfitUsd: 45,
                paidPerformancePct: 45,
                questCreatorEarningsUsd: 15,
                paidRequests: 10,
                sources: [
                    {
                        type: "app",
                        id: "app-1",
                        name: "App One",
                        models: ["flux", "openai"],
                    },
                    {
                        type: "model",
                        id: "community/model-1",
                        name: "community/model-1",
                        models: ["model-1"],
                    },
                ],
            }),
        ]);
    });

    it("rejects malformed source attribution instead of hiding it", () => {
        expect(() =>
            revenueShareRows(
                { revenueShare: [share({ sources_json: "{}" })] },
                "2026-07",
            ),
        ).toThrow("Revenue Share sources must be an array");
    });
});

describe("revenueShareLedgerRows", () => {
    it("returns one compact row for each developer source", () => {
        const rows = revenueShareLedgerRows(
            {
                revenueShare: [
                    share({
                        row_type: "source",
                        sources_json: JSON.stringify([
                            ["app", "app-1", "App One", "openai"],
                            ["app", "app-1", "App One", "flux"],
                        ]),
                    }),
                ],
            },
            "2026-07",
        );

        expect(rows).toEqual([
            expect.objectContaining({
                recipientId: "developer-1",
                source: {
                    type: "app",
                    id: "app-1",
                    name: "App One",
                    models: ["flux", "openai"],
                },
                paidCreatorEarningsUsd: 35,
                questCreatorEarningsUsd: 15,
            }),
        ]);
    });
});

describe("revenueShareSummary", () => {
    it("uses deduplicated summary rows instead of summing developer rows", () => {
        const summary = share({
            row_type: "summary",
            recipient_id: "",
            github_username: "",
            recipient_name: "",
            sources_json: "[]",
            paid_usage: 100,
            paid_creator_earnings: 95,
            paid_pollinations_profit: 5,
            paid_requests: 1,
        });
        const otherDeveloper = share({
            recipient_id: "developer-2",
            github_username: "developer-two",
            recipient_name: "Developer Two",
            paid_usage: 100,
            paid_pollinations_profit: 5,
            paid_requests: 1,
        });

        expect(
            revenueShareSummary(
                { revenueShare: [summary, share(), otherDeveloper] },
                "2026-07",
            ),
        ).toMatchObject({
            paidUsageUsd: 100,
            paidCreatorEarningsUsd: 95,
            paidPollinationsProfitUsd: 5,
            paidPerformancePct: 5,
            paidRequests: 1,
        });
    });
});

describe("creatorSettlementRows", () => {
    it("includes only completed cash movements explicitly tagged as creator payouts", () => {
        const data: Data = {
            opTransactions: [
                {
                    entry_id: "payout-1",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-20",
                    vendor: "creator",
                    category: "creator_payout",
                    amount: -100,
                    currency: "USD",
                    description: "Creator payout",
                    evidence: "https://drive.google.com/file/d/example/view",
                    recorded_at: "2026-07-20 00:00:00.000",
                },
                {
                    entry_id: "invoice-only",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-20",
                    vendor: "creator",
                    category: "compute",
                    amount: -100,
                    currency: "USD",
                    description: "Not explicitly a creator payout",
                    evidence: "",
                    recorded_at: "2026-07-20 00:00:00.000",
                },
            ],
        };

        expect(creatorSettlementRows(data, "2026-07")).toEqual([
            expect.objectContaining({
                entryId: "payout-1",
                creator: "creator",
                amountUsd: 100,
                method: "wise",
            }),
        ]);
    });
});
