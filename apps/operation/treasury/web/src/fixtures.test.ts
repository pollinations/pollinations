import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import type { CoverageRow, RunRow } from "./types";

const EXPECTED_PIPES = [
    "coverage_ep",
    "gaps_ep",
    "invoices_ep",
    "cash_monthly_ep",
    "grants_ep",
    "balances_ep",
    "provider_month_ep",
    "runs_ep",
];

const ALL_STATUSES = [
    "ok",
    "ok_credit",
    "accepted",
    "needs_data",
    "needs_review",
    "amount_mismatch",
    "missing_invoice",
    "missing_payment",
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

    it("exercises every reconciliation status", () => {
        const seen = new Set(
            (FIXTURES.coverage_ep as CoverageRow[]).map((r) => r.status),
        );

        for (const status of ALL_STATUSES) {
            expect(seen.has(status), status).toBe(true);
        }
    });

    it("run statuses are parseable JSON objects", () => {
        for (const run of FIXTURES.runs_ep as RunRow[]) {
            const parsed = JSON.parse(run.statuses);
            expect(typeof parsed).toBe("object");
        }
    });
});
