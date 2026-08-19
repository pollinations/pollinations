import { describe, expect, it } from "vitest";
import { formatValue } from "../src/lib/format";
import { KPIS, kpiValue, kpiView } from "../src/lib/kpis";

const community = KPIS.find((row) => row.key === "communityModels");

// One week as the dashboard sees it, after useKpiData maps the usage pipe.
const week = {
    week: "2026-08-10",
    communityUserPct: 12.4,
    communityRequestPct: 3.6,
    communityAvailability: 98.75,
};

describe("community models row", () => {
    it("cycles through all three views and back", () => {
        const names = [0, 1, 2, 3].map((i) => kpiView(community, i).name);
        expect(names).toEqual([
            "Community models · users",
            "Community models · requests",
            "Community models · availability",
            "Community models · users",
        ]);
    });

    it("reads a different field in each view", () => {
        const values = [0, 1, 2].map((i) =>
            kpiValue(kpiView(community, i), week),
        );
        expect(values).toEqual([12.4, 3.6, 98.75]);
    });

    it("formats every view as a percentage", () => {
        const shown = [0, 1, 2].map((i) => {
            const view = kpiView(community, i);
            return formatValue(kpiValue(view, week), view.format);
        });
        expect(shown).toEqual(["12%", "4%", "99%"]);
    });

    it("gives each view its own tooltip naming the 4xx treatment", () => {
        const tooltips = community.views.map((view) => view.tooltip);
        expect(new Set(tooltips).size).toBe(3);
        for (const tooltip of tooltips) expect(tooltip).toMatch(/4xx/);
    });

    it("reads as missing, not zero, before the pipe ships the fields", () => {
        const before = { week: "2026-05-04" };
        for (const index of [0, 1, 2]) {
            const view = kpiView(community, index);
            expect(kpiValue(view, before)).toBeUndefined();
            expect(formatValue(kpiValue(view, before), view.format)).toBe("—");
        }
    });
});
