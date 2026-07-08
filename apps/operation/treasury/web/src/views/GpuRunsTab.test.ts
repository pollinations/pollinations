import { describe, expect, it } from "vitest";
import type { GpuRunRow } from "../types";
import { runsEmptyNotice, visibleRunRows } from "./GpuRunsTab";

const rows: GpuRunRow[] = [
    {
        month: "2026-06",
        vendor: "runpod",
        run_id: "hsl3ksl31lvrcc",
        deployment: "zimage-4090-secure",
        gpu: "RTX 4090",
        gpu_count: 1,
        started_at: "2026-06-04 08:12:00",
        ended_at: "2026-06-04 14:47:00",
        hours: 6.58,
        cost: 4.54,
        currency: "USD",
        model: "zimage",
        kind: "gpu",
        source: "api",
    },
    {
        month: "2026-05",
        vendor: "io.net",
        run_id: "ionet-run-2201",
        deployment: "sana-h100-a",
        gpu: "H100",
        gpu_count: 1,
        started_at: "2026-05-10 00:00:00",
        ended_at: "2026-05-10 05:30:00",
        hours: 5.5,
        cost: 12.1,
        currency: "EUR",
        model: "sana",
        kind: "gpu",
        source: "manual",
    },
];

describe("visibleRunRows", () => {
    it("filters by month (exact) and vendor", () => {
        expect(
            visibleRunRows({ runRows: rows, month: "2026-06", vendor: "all" }),
        ).toHaveLength(1);
        expect(
            visibleRunRows({ runRows: rows, month: "2026", vendor: "io.net" }),
        ).toHaveLength(1);
        expect(
            visibleRunRows({ runRows: rows, month: "", vendor: "all" }),
        ).toHaveLength(2);
    });
});

describe("runsEmptyNotice", () => {
    it("returns ingest message when no rows exist", () => {
        const message = runsEmptyNotice([], []);
        expect(message).toContain("No GPU runs ingested yet");
        expect(message).toContain("python3 -m ingest.run --only runs");
    });

    it("returns period mismatch message when rows exist but none visible", () => {
        const message = runsEmptyNotice(rows, []);
        expect(message).toContain("No GPU runs match this period");
        expect(message).toContain("2026-05");
        expect(message).toContain("2026-06");
        expect(message).toContain("2 rows");
    });

    it("returns null when rows are visible", () => {
        const visibleRows = visibleRunRows({
            runRows: rows,
            month: "2026-06",
            vendor: "all",
        });
        const message = runsEmptyNotice(rows, visibleRows);
        expect(message).toBeNull();
    });
});
