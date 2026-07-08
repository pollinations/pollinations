import { describe, expect, it } from "vitest";
import type { GpuFleetRow } from "../types";
import { visibleFleetRows } from "./FleetTab";

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
