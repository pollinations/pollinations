import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import { DataQualityTab } from "./DataQualityTab";

const data: Data = {
    opTransactions: [],
    opCloud: [],
    opPollen: [],
    opRunway: [],
};

describe("DataQualityTab", () => {
    it("keeps ledger integrity and provider registry checks together", () => {
        const html = renderToStaticMarkup(
            createElement(DataQualityTab, { data, month: "2026-07" }),
        );

        expect(html).toContain("Monthly ledger audit");
        expect(html).toContain("Provider registry");
        expect(html).not.toContain("Direct drift");
    });
});
