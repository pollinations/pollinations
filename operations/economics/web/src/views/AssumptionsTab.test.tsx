import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EconomicsPrivateConfig } from "../types";
import { AssumptionsTab, assumptionRows } from "./AssumptionsTab";

const config: EconomicsPrivateConfig = {
    recordedAt: "2026-10-15 13:34:27.243",
    forecastRules: {
        "stripe sales|revenue": {
            salesStoppedFrom: { kofi: "2026-10-16" },
        },
    },
    reviewNotes: {
        providerCheckExplanations: [
            {
                month: "2026-03",
                provider: "pruna",
                reason: "unverifiable_history",
                explanation:
                    "Provider export cannot be recovered; amount remains provisional.",
                evidence: ["https://drive.google.com/file/d/review/view"],
            },
        ],
        meterDriftExplanations: [],
        pollenWitnessExplanations: [],
    },
};

describe("reviewed assumptions visibility", () => {
    it("shows non-monetary planning rules and review notes without changing them", () => {
        const before = structuredClone(config);
        const rows = assumptionRows(config);
        expect(
            rows.find((row) => row.group === "Planning")?.description,
        ).toContain("No new sales projected");
        expect([...new Set(rows.map((row) => row.group))]).toEqual([
            "Planning",
            "Review notes",
        ]);
        expect(
            rows.find((row) => row.group === "Review notes")?.description,
        ).toContain("amount remains provisional");
        expect(config).toEqual(before);
    });
    it("shows the saved version and original source actions without editable controls", () => {
        const html = renderToStaticMarkup(<AssumptionsTab config={config} />);
        expect(html).toContain(config.recordedAt);
        expect(html).toContain("Financial facts live in Sales and Vendor");
        expect(html).toContain("Preview document");
        expect(html).toContain("Download document");
        expect(html).not.toContain("<input");
    });
});
