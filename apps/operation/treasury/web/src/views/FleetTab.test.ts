import { describe, expect, it } from "vitest";
import type { GpuFleetRow } from "../types";
import { fleetEmptyNotice, visibleFleetRows } from "./FleetTab";

const rows: GpuFleetRow[] = [
    {
        recorded_at: "2026-07-08 10:00:00",
        vendor: "runpod",
        deployment: "a",
        gpu: "RTX 4090",
        gpu_count: 1,
        usd_per_hr: 0.69,
        balance_usd: 80,
    },
    {
        recorded_at: "2026-06-01 09:00:00",
        vendor: "vast.ai",
        deployment: "b",
        gpu: "RTX 5090",
        gpu_count: 1,
        usd_per_hr: 0.43,
        balance_usd: 225,
    },
];

describe("visibleFleetRows", () => {
    it("filters by month prefix and vendor", () => {
        expect(
            visibleFleetRows({
                fleetRows: rows,
                month: "2026-07",
                vendor: "all",
            }),
        ).toHaveLength(1);
        expect(
            visibleFleetRows({
                fleetRows: rows,
                month: "2026",
                vendor: "vast.ai",
            }),
        ).toHaveLength(1);
    });
});

describe("fleetEmptyNotice", () => {
    it("returns ingest message when no rows exist", () => {
        const message = fleetEmptyNotice([], []);
        expect(message).toContain("No snapshots ingested yet");
        expect(message).toContain("python3 -m ingest.run --only fleet");
    });

    it("returns period mismatch message when rows exist but none visible", () => {
        const message = fleetEmptyNotice(rows, []);
        expect(message).toContain("No fleet snapshots match this period");
        expect(message).toContain("2026-06-01");
        expect(message).toContain("2026-07-08");
        expect(message).toContain("2 rows");
    });

    it("returns null when rows are visible", () => {
        const visibleRows = visibleFleetRows({
            fleetRows: rows,
            month: "2026-07",
            vendor: "all",
        });
        const message = fleetEmptyNotice(rows, visibleRows);
        expect(message).toBeNull();
    });
});
