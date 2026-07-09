import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import type { RunRow } from "./types";

const EXPECTED_PIPES = [
    "op_transactions_api",
    "op_cloud_api",
    "op_pollen_api",
    "ingest_runs_api",
];

describe("fixtures", () => {
    it("covers every pipe the app fetches", () => {
        for (const pipe of EXPECTED_PIPES) {
            expect(FIXTURES[pipe], pipe).toBeDefined();
            expect(FIXTURES[pipe], pipe).toBeInstanceOf(Array);
        }
    });

    it("run statuses are parseable JSON objects", () => {
        for (const run of FIXTURES.ingest_runs_api as RunRow[]) {
            const parsed = JSON.parse(run.statuses);
            expect(typeof parsed).toBe("object");
        }
    });
});
