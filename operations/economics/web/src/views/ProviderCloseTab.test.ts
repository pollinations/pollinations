import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import { ProviderCloseTab } from "./ProviderCloseTab";

const data: Data = {
    opTransactions: [
        {
            entry_id: "wise-openai-january",
            kind: "transaction",
            source: "wise",
            date: "2026-01-22",
            vendor: "openai",
            category: "development",
            amount: -86.55,
            currency: "USD",
            description: "ChatGPT",
            evidence: "Wise card transaction reference only",
            recorded_at: "2026-01-22 00:00:00",
        },
    ],
    opCloud: [
        {
            entry_id: "azure-january",
            source: "invoice",
            vendor: "azure",
            type: "inference",
            start: "2026-01-01 00:00:00",
            end: "2026-02-01 00:00:00",
            credit: -100,
            paid: 0,
            currency: "USD",
            resource_id: "",
            resource_name: "",
            resource_sku: "",
            resource_count: 1,
            model: "",
            evidence:
                "https://drive.google.com/file/d/azure-january-source/view",
            recorded_at: "2026-02-01 00:00:00",
        },
    ],
    opPollen: [],
    opForecast: [],
};

describe("ProviderCloseTab", () => {
    it("combines provider readiness with monthly transaction evidence", () => {
        const html = renderToStaticMarkup(
            createElement(ProviderCloseTab, {
                data,
                month: "2026-01",
            }),
        );

        expect(html).toContain("Action needed");
        expect(html).toContain("1 transaction document missing");
        expect(html).toContain("Vendor source (1)");
        expect(html).toContain("Ledger integrity");
        expect(html).toContain("Missing documents");
        expect(html.indexOf("Ledger integrity")).toBeLessThan(
            html.indexOf("Monthly close"),
        );
        expect(html).not.toContain("Wise matched");
        expect(html).not.toContain("payment unmatched");
    });
});
