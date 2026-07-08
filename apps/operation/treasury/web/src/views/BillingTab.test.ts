import { describe, expect, it } from "vitest";
import type { GpuBillingRow } from "../types";
import { billingEmptyNotice, visibleBillingRows } from "./BillingTab";

const rows: GpuBillingRow[] = [
    {
        month: "2026-06",
        vendor: "runpod",
        deployment: "zimage-4090-secure",
        gpu: "RTX 4090",
        amount: 432.27,
        currency: "USD",
        source: "api",
    },
    {
        month: "2026-05",
        vendor: "lambda",
        deployment: "Sana - LTX-2.3 - AceStep",
        gpu: "1x GH200 (96 GB)",
        amount: 312.5,
        currency: "USD",
        source: "manual",
    },
];

describe("visibleBillingRows", () => {
    it("filters by month prefix and vendor", () => {
        expect(
            visibleBillingRows({
                billingRows: rows,
                month: "2026-06",
                vendor: "all",
            }),
        ).toHaveLength(1);
        expect(
            visibleBillingRows({
                billingRows: rows,
                month: "2026",
                vendor: "lambda",
            }),
        ).toHaveLength(1);
        expect(
            visibleBillingRows({
                billingRows: rows,
                month: "",
                vendor: "all",
            }),
        ).toHaveLength(2);
    });
});

describe("billingEmptyNotice", () => {
    it("returns ingest message when no rows exist", () => {
        const message = billingEmptyNotice([], []);
        expect(message).toContain("No billing rows ingested yet");
        expect(message).toContain("python3 -m ingest.run --only billing");
    });

    it("returns period mismatch message when rows exist but none visible", () => {
        const message = billingEmptyNotice(rows, []);
        expect(message).toContain("No billing rows match this period");
        expect(message).toContain("2026-05");
        expect(message).toContain("2026-06");
        expect(message).toContain("2 rows");
    });

    it("returns null when rows are visible", () => {
        const visibleRows = visibleBillingRows({
            billingRows: rows,
            month: "2026-06",
            vendor: "all",
        });
        const message = billingEmptyNotice(rows, visibleRows);
        expect(message).toBeNull();
    });
});
