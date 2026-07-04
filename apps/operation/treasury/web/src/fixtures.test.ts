import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import type { RunRow } from "./types";

const EXPECTED_PIPES = [
    "invoices_ep",
    "payments_ep",
    "meter_monthly_ep",
    "usage_ep",
    "runs_ep",
    "revenue_ep",
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
        for (const run of FIXTURES.runs_ep as RunRow[]) {
            const parsed = JSON.parse(run.statuses);
            expect(typeof parsed).toBe("object");
        }
    });
});
