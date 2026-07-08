import { describe, expect, it } from "vitest";
import {
    flagIntent,
    showsModelSubtext,
    visibleGpuRows,
    visibleGpuTypeRows,
} from "./GpuTab";

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
        expect(
            flagIntent("error: no provider bill this month — rent unwitnessed"),
        ).toBe("danger");
        expect(
            flagIntent(
                "error: no gpu runs this month — deployment split unavailable",
            ),
        ).toBe("danger");
        expect(
            flagIntent("error: gpu runs have zero cost — cannot split bill"),
        ).toBe("danger");
        expect(
            flagIntent(
                "error: unmapped model — assign the deployment in forager config/gpu_models.json",
            ),
        ).toBe("danger");
    });
    it("classifies non-error flags as warning", () => {
        expect(flagIntent("unmapped fleet")).toBe("warning");
        expect(flagIntent("unattributed: flux")).toBe("warning");
        expect(flagIntent("hybrid: AI Endpoints + instance")).toBe("warning");
        expect(flagIntent("hours unknown")).toBe("warning");
    });
});

describe("showsModelSubtext", () => {
    it("hides sub-text for a normal per-model row (models === [group])", () => {
        expect(showsModelSubtext({ group: "flux", models: ["flux"] })).toBe(
            false,
        );
    });
    it("shows sub-text for a (vendor total) fallback row", () => {
        expect(
            showsModelSubtext({
                group: "(vendor total)",
                models: ["flux", "zimage"],
            }),
        ).toBe(true);
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

const mkType = (vendor: string, gpu: string, costUsd: number) => ({
    vendor,
    gpu,
    month: "2026-06",
    hours: null,
    costUsd,
    impliedUsdPerHr: null,
    models: [],
    flags: [],
});

describe("visibleGpuTypeRows", () => {
    it("filters by vendor and sorts by costUsd desc", () => {
        const rows = [
            mkType("runpod", "RTX 4090", 100),
            mkType("lambda", "A100", 400),
            mkType("runpod", "H100", 250),
        ];
        const out = visibleGpuTypeRows({ rows, vendor: "all" });
        expect(out.map((r) => r.gpu)).toEqual(["A100", "H100", "RTX 4090"]);
        expect(
            visibleGpuTypeRows({ rows, vendor: "runpod" }).map((r) => r.gpu),
        ).toEqual(["H100", "RTX 4090"]);
    });
});
