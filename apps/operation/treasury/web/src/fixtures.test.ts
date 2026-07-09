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
});
