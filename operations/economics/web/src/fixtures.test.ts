import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";

const EXPECTED_PIPES = ["op_transactions_api", "op_cloud_api", "op_pollen_api"];

describe("fixtures", () => {
    it("covers every pipe the app fetches", () => {
        for (const pipe of EXPECTED_PIPES) {
            expect(FIXTURES[pipe], pipe).toBeDefined();
            expect(FIXTURES[pipe], pipe).toBeInstanceOf(Array);
        }
    });

    it("gives every transaction a stable entry id", () => {
        const transactions = FIXTURES.op_transactions_api as Array<{
            entry_id: string;
        }>;
        const ids = transactions.map((row) => row.entry_id);
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("keeps one statement-backed opening balance in the bank ledger", () => {
        const transactions = FIXTURES.op_transactions_api as Array<{
            kind: string;
        }>;
        expect(
            transactions.filter((row) => row.kind === "opening_balance"),
        ).toHaveLength(1);
    });

    it("covers every 2026 month through the current demo month", () => {
        const transactions = FIXTURES.op_transactions_api as Array<{
            date: string;
        }>;
        const months = [
            ...new Set(transactions.map((row) => row.date.slice(0, 7))),
        ].sort();

        expect(months).toEqual([
            "2026-01",
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
            "2026-06",
            "2026-07",
            "2026-08",
        ]);
    });

    it("keeps every unit-economics view populated in the latest closed demo month", () => {
        const cloud = FIXTURES.op_cloud_api as Array<{
            start: string;
            type: string;
        }>;
        const pollen = FIXTURES.op_pollen_api as Array<{
            month: string;
            vendor: string;
        }>;

        expect(
            cloud.some(
                (row) =>
                    row.start.startsWith("2026-07") && row.type === "inference",
            ),
        ).toBe(true);
        expect(
            cloud.some(
                (row) => row.start.startsWith("2026-07") && row.type === "gpu",
            ),
        ).toBe(true);
        expect(pollen.some((row) => row.month === "2026-07")).toBe(true);
        expect(
            pollen.some(
                (row) => row.month === "2026-07" && row.vendor === "community",
            ),
        ).toBe(true);
    });
});
