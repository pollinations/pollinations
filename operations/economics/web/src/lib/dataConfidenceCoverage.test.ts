import { describe, expect, it } from "vitest";
import { dataConfidence } from "./dataConfidence";
import type { ReconciliationIssue } from "./reconciliation";
import { unitEconomicsReport } from "./unitEconomics";

const issue: ReconciliationIssue = {
    id: "coverage",
    month: "2026-09",
    vendor: "provider",
    group: "financial",
    types: ["coverage"],
    messages: ["An account has no monthly source"],
    affects: ["inference", "trends"],
    priority: 1,
    amountUsd: null,
    amountLabel: "Unknown",
    evidence: [],
};

describe("confidence source coverage", () => {
    it("does not let an empty or nonblocking report override missing financial sources", () => {
        const report = unitEconomicsReport(
            { vendorLedger: [], opPollen: [], opTransactions: [] },
            "2026-09",
            "inference",
        );
        expect(dataConfidence([issue], report).status).toBe("Incomplete");
        expect(dataConfidence([issue], report).detail).not.toContain(
            "sources are present",
        );
    });
    it("does not call a source-free month complete", () => {
        const report = unitEconomicsReport(
            { vendorLedger: [], opPollen: [], opTransactions: [] },
            "2026-10",
            "inference",
        );
        expect(dataConfidence([], report).status).toBe("Incomplete");
        expect(dataConfidence([], report).detail).toContain(
            "No provider records",
        );
    });
});
