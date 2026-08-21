import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";

const EXPECTED_PIPES = [
    "op_transactions_api",
    "op_cloud_api",
    "op_pollen_api",
    "op_runway_api",
];

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
});
