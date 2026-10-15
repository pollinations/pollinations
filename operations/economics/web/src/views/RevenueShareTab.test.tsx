import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import { RevenueShareTab } from "./RevenueShareTab";

const data: Data = {
    revenueShare: [
        {
            row_type: "creator",
            month: "2026-08",
            recipient_id: "user-123456",
            github_username: "creator-name",
            recipient_name: "Creator name",
            sources_json: JSON.stringify([
                ["app", "app-1", "First app", "model-a"],
                ["model", "model-1", "First model", "model-a"],
                ["model", "model-2", "Second model", "model-b"],
            ]),
            paid_usage: 100,
            paid_creator_earnings: 25,
            paid_pollinations_profit: 60,
            quest_usage: 10,
            quest_creator_earnings: 2.5,
            paid_requests: 8,
            quest_requests: 2,
        },
    ],
    opTransactions: [],
};

describe("RevenueShareTab", () => {
    it("shows one compact creator row with source counts", () => {
        const html = renderToStaticMarkup(
            <RevenueShareTab data={data} month="2026-08" />,
        );

        expect(html).toContain("@creator-name");
        expect(html).toContain("Models 2");
        expect(html).toContain("App 1");
        expect(html).toContain("Copy user ID for @creator-name");
        expect(html).not.toContain("First model");
        expect(html).not.toContain("Second model");
        expect(html).not.toContain("First app");
        expect(html).not.toContain("Developer ·");
    });
});
