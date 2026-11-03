import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductMixCard } from "../components/ProductMixCard";
import type { Data, OpPollenRow, RevenueShareSourceRow } from "../types";
import { monthlyProductMix } from "./productMix";

const pollen = (override: Partial<OpPollenRow> = {}): OpPollenRow => ({
    month: "2026-09",
    vendor: "openai",
    model: "model-a",
    currency: "USD",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 225,
    price_quests: 0,
    byop_paid: 25,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
    ...override,
});
const share = (
    override: Partial<RevenueShareSourceRow> = {},
): RevenueShareSourceRow => ({
    row_type: "source",
    month: "2026-09",
    recipient_id: "creator",
    github_username: "creator",
    recipient_name: "Creator",
    sources_json: JSON.stringify([
        ["app", "app-a", "App A", "model-a"],
        ["app", "app-a", "App A", "community-a"],
    ]),
    paid_usage: 250,
    paid_creator_earnings: 50,
    paid_pollinations_profit: 0,
    paid_community_usage: 125,
    paid_model_creator_earnings: 75,
    quest_usage: 900,
    quest_creator_earnings: 180,
    quest_community_usage: 0,
    quest_model_creator_earnings: 0,
    paid_requests: 1,
    quest_requests: 1,
    ...override,
});
const data = {
    opPollen: [
        pollen(),
        pollen({ vendor: "community", model: "community-a", model_paid: 150 }),
    ],
    revenueShare: [
        share(),
        share({
            sources_json: JSON.stringify([
                ["model", "community-a", "Community A", "community-a"],
            ]),
            paid_usage: 225,
            paid_creator_earnings: 150,
            paid_community_usage: 0,
            paid_model_creator_earnings: 0,
        }),
        share({ row_type: "creator" }),
        share({ row_type: "summary" }),
    ],
} satisfies Data;

describe("monthlyProductMix", () => {
    it("counts a BYOP community request once and retains both creator deductions", () => {
        const [{ streams }] = monthlyProductMix(data, ["2026-09"]);
        expect(streams).toEqual({
            models: { consumed: 100, retained: 100 },
            byop: { consumed: 250, retained: 125 },
            community: { consumed: 100, retained: 25 },
        });
        expect(
            Object.values(streams ?? {}).reduce(
                (n, row) => n + row.consumed,
                0,
            ),
        ).toBe(450);
        expect(
            Object.values(streams ?? {}).reduce(
                (n, row) => n + row.retained,
                0,
            ),
        ).toBe(250);
    });
    it("reconciles Quest independently and does not double-count app/community usage", () => {
        const both = {
            ...data,
            opPollen: data.opPollen.map((row) => ({
                ...row,
                price_quests: row.price_paid * 2,
                byop_quests: row.byop_paid * 2,
                model_quests: row.model_paid * 2,
            })),
            revenueShare: data.revenueShare.map((row) => ({
                ...row,
                quest_usage: row.paid_usage * 2,
                quest_creator_earnings: row.paid_creator_earnings * 2,
                quest_community_usage: row.paid_community_usage * 2,
                quest_model_creator_earnings:
                    row.paid_model_creator_earnings * 2,
            })),
        };
        expect(
            monthlyProductMix(both, ["2026-09"], "quest")[0].streams,
        ).toEqual({
            models: { consumed: 200, retained: 200 },
            byop: { consumed: 500, retained: 250 },
            community: { consumed: 200, retained: 50 },
        });
        expect(monthlyProductMix(both, ["2026-09"])).toEqual(
            monthlyProductMix(data, ["2026-09"]),
        );
        both.opPollen[0].byop_quests += 1;
        expect(
            monthlyProductMix(both, ["2026-09"], "quest")[0].streams,
        ).toBeNull();
        expect(monthlyProductMix(both, ["2026-09"])).toEqual(
            monthlyProductMix(data, ["2026-09"]),
        );
    });
    it("does not turn missing attribution or month coverage into zero usage", () => {
        expect(
            monthlyProductMix({ ...data, revenueShare: [] }, ["2026-09"])[0]
                .streams,
        ).toBeNull();
        expect(monthlyProductMix(data, ["2026-08"])[0].streams).toBeNull();
    });
    it("keeps recorded tooling out of the three model/app streams", () => {
        const withTools = {
            ...data,
            opPollen: [
                ...data.opPollen,
                pollen({
                    vendor: "exa",
                    model: "exa",
                    price_paid: 2,
                    byop_paid: 0,
                }),
            ],
        };
        expect(monthlyProductMix(withTools, ["2026-09"])).toEqual(
            monthlyProductMix(data, ["2026-09"]),
        );
    });
    it("rejects impossible overlap instead of hiding negative residuals", () => {
        const invalid = {
            ...data,
            revenueShare: data.revenueShare.map((r, i) =>
                i === 0 ? { ...r, paid_community_usage: 500 } : r,
            ),
        };
        expect(monthlyProductMix(invalid, ["2026-09"])[0].streams).toBeNull();
    });
});

it("keeps sub-unit retained amounts readable in chart tooltips", () => {
    const html = renderToStaticMarkup(
        createElement(ProductMixCard, {
            rows: [
                {
                    month: "2026-09",
                    streams: {
                        models: { consumed: 0.5, retained: 0.2 },
                        byop: { consumed: 0, retained: 0 },
                        community: { consumed: 0, retained: 0 },
                    },
                },
            ],
            activeMonth: "2026-09",
            onInspect: () => {},
        }),
    );
    expect(html).toContain("0.2 retained</title>");
    expect(html).not.toContain(":  retained");
});
