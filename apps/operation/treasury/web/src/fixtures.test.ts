import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import type { RunRow } from "./types";

const EXPECTED_PIPES = [
    "transactions_api",
    "meter_monthly_api",
    "usage_monthly_api",
    "ingest_runs_api",
    "revenue_monthly_api",
];

describe("fixtures", () => {
    it("covers every pipe the app fetches", () => {
        for (const pipe of EXPECTED_PIPES) {
            expect(FIXTURES[pipe], pipe).toBeDefined();
            expect((FIXTURES[pipe] as unknown[]).length, pipe).toBeGreaterThan(
                0,
            );
        }
    });

    it("run statuses are parseable JSON objects", () => {
        for (const run of FIXTURES.ingest_runs_api as RunRow[]) {
            const parsed = JSON.parse(run.statuses);
            expect(typeof parsed).toBe("object");
        }
    });
});
