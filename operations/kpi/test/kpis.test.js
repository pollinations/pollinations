import { describe, expect, it } from "vitest";
import { formatValue } from "../src/lib/format";
import {
    KPI_VIEWS,
    KPIS,
    kpiValue,
    kpiView,
    kpiViewById,
    kpiViewId,
} from "../src/lib/kpis";

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

describe("explorer view list", () => {
    it("offers every view of every row, not one per row", () => {
        const expected = KPIS.reduce(
            (total, row) => total + (row.views?.length ?? 1),
            0,
        );
        expect(KPI_VIEWS).toHaveLength(expected);
        expect(KPI_VIEWS.length).toBeGreaterThan(KPIS.length);
    });

    it("gives each view a unique id that resolves back to it", () => {
        const ids = KPI_VIEWS.map((view) => view.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const view of KPI_VIEWS)
            expect(kpiViewById(view.id).name).toBe(view.name);
    });

    it("lists all three community variants separately", () => {
        const names = KPI_VIEWS.filter((view) =>
            view.id.startsWith("communityModels:"),
        ).map((view) => view.name);
        expect(names).toEqual([
            "Community models · users",
            "Community models · requests",
            "Community models · availability",
        ]);
    });

    it("sends a cycled table row to the variant it is showing", () => {
        // The table's graph button passes kpiViewId(row, index); index 2 on the
        // community row must land on availability, not back on users.
        expect(kpiViewById(kpiViewId(community, 2)).name).toBe(
            "Community models · availability",
        );
        expect(kpiViewById(kpiViewId(community, 4)).name).toBe(
            "Community models · requests",
        );
    });

    it("falls back to the first view for an unknown id", () => {
        expect(kpiViewById("nope:9").id).toBe(KPI_VIEWS[0].id);
    });
});

const margin = KPIS.find((row) => row.key === "grossMargin");
const coverage = KPIS.find((row) => row.key === "cashCoverage");

// A real week from prod (2026-08-10), trimmed to the fields these rows read.
const marginWeek = {
    week: "2026-08-10",
    pollenRevenue: 3469,
    costUsd: 3740,
    revenue: 2278,
};

describe("gross margin row", () => {
    it("measures Pollen revenue against cost, not Stripe cash", () => {
        // Stripe cash that week was 2278 — using it would read −64%.
        expect(kpiValue(margin, marginWeek)).toBeCloseTo(-7.81, 1);
    });

    it("blanks a week with no Pollen spent rather than reading zero", () => {
        expect(kpiValue(margin, { pollenRevenue: 0, costUsd: 10 })).toBeNull();
    });
});

describe("cash coverage row", () => {
    it("compares Stripe cash against the week's compute cost", () => {
        expect(kpiValue(coverage, marginWeek)).toBeCloseTo(60.91, 1);
    });

    it("blanks a week with no cost rather than dividing by zero", () => {
        expect(kpiValue(coverage, { revenue: 100, costUsd: 0 })).toBeNull();
    });
});

const wau = KPIS.find((row) => row.key === "wau");
const turnedAway = KPIS.find((row) => row.key === "turnedAway");
const byop = KPIS.find((row) => row.key === "byopUserPct");

// Week of 2026-08-10 as the pipes now report it.
const rejectionWeek = {
    week: "2026-08-10",
    wau: 3352,
    wauAll: 6859,
    byopUserPct: 11.1,
    byopUserPctAll: 15.0,
};

describe("402 rejections", () => {
    it("defaults WAU to served users, not everyone who knocked", () => {
        expect(kpiValue(kpiView(wau, 0), rejectionWeek)).toBe(3352);
    });

    it("cycles to the raw figure the dashboard used to show", () => {
        const view = kpiView(wau, 1);
        expect(view.name).toBe("WAU · incl. rejected");
        expect(kpiValue(view, rejectionWeek)).toBe(6859);
    });

    it("reports the gap as its own row", () => {
        expect(kpiValue(turnedAway, rejectionWeek)).toBe(3507);
    });

    it("cycles BYOP share between served and raw", () => {
        expect(kpiValue(kpiView(byop, 0), rejectionWeek)).toBe(11.1);
        expect(kpiValue(kpiView(byop, 1), rejectionWeek)).toBe(15.0);
    });

    it("offers both WAU variants in the explorer", () => {
        const names = KPI_VIEWS.filter((v) => v.id.startsWith("wau:")).map(
            (v) => v.name,
        );
        expect(names).toEqual(["WAU", "WAU · incl. rejected"]);
    });
});
