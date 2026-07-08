import { describe, expect, it } from "vitest";
import { flagIntent, visibleGpuRows } from "./GpuTab";

const mk = (vendor: string, coverage: number | null) => ({
    group: vendor,
    vendor,
    month: "2026-06",
    rentUsd: 1,
    models: [],
    requests: 0,
    paidUsd: 0,
    questUsd: 0,
    retainedUsd: 0,
    coverage,
    effUsdPerReq: null,
    breakEven: [],
    verdict: null,
    flags: [],
    kind: "gpu" as const,
});

describe("flagIntent", () => {
    it("classifies error: flags as danger", () => {
        expect(
            flagIntent(
                "error: no fleet snapshot this month — deployment split unavailable",
            ),
        ).toBe("danger");
        expect(
            flagIntent(
                "error: fleet API blocked — consumer key lacks /cloud/project scope",
            ),
        ).toBe("danger");
    });
    it("classifies non-error flags as warning", () => {
        expect(flagIntent("unmapped fleet")).toBe("warning");
        expect(flagIntent("unattributed: flux")).toBe("warning");
        expect(flagIntent("hybrid: AI Endpoints + instance")).toBe("warning");
    });
});

describe("visibleGpuRows", () => {
    it("filters by vendor and sorts worst coverage first, nulls last", () => {
        const rows = [
            mk("runpod", 1.8),
            mk("lambda", 0.3),
            mk("ovhcloud", null),
        ];
        const out = visibleGpuRows({ rows, vendor: "all" });
        expect(out.map((r) => r.vendor)).toEqual([
            "lambda",
            "runpod",
            "ovhcloud",
        ]);
        expect(visibleGpuRows({ rows, vendor: "lambda" })).toHaveLength(1);
    });
});
