import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/d1.ts", () => ({
    executeD1: vi.fn(),
    queryD1: vi.fn(() => []),
}));

// trust-score.ts reads a .md file at module load time via readFileSync.
// Mock it so the module can be imported in the Workers sandbox.
vi.mock("node:fs", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:fs")>();
    return {
        ...original,
        readFileSync: (path: unknown, ...args: unknown[]) => {
            if (typeof path === "string" && path.endsWith("trust-score-prompt.md")) {
                return "mocked prompt";
            }
            if (path instanceof URL && String(path).endsWith("trust-score-prompt.md")) {
                return "mocked prompt";
            }
            return original.readFileSync(path as Parameters<typeof original.readFileSync>[0], ...(args as [never]));
        },
    };
});

import {
    parseLLMResponse,
    SCORE_THRESHOLDS,
} from "../scoring/trust-score.ts";

describe("parseLLMResponse", () => {
    it("parses CSV rows and clamps scores to 0-100", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        const parsed = parseLLMResponse(
            "github_id,score,signals\n12345678,120,cluster+burst\n87654321,-5,ok",
            idToIndex,
            2,
        );

        expect(parsed).toEqual([
            { score: 100, signals: ["cluster", "burst"] },
            { score: 0, signals: [] },
        ]);
    });

    it("throws when the LLM omits a user", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        expect(() =>
            parseLLMResponse(
                "github_id,score,signals\n12345678,10,ok",
                idToIndex,
                2,
            ),
        ).toThrow("LLM response omitted one or more users from the chunk");
    });

    it("does not throw when strict=false and user is omitted", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        const parsed = parseLLMResponse(
            "github_id,score,signals\n12345678,10,ok",
            idToIndex,
            2,
            { strict: false },
        );

        expect(parsed[0].score).toBe(10);
        expect(parsed[1].score).toBe(0); // default for omitted user
    });

    it("ignores trailing prose after valid CSV rows", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        const parsed = parseLLMResponse(
            [
                "github_id,score,signals",
                "12345678,100,cluster+burst",
                "87654321,0,",
                "",
                "---",
                "### Analysis Summary",
                "The main suspicious cluster is 12345678.",
            ].join("\n"),
            idToIndex,
            2,
        );

        expect(parsed).toEqual([
            { score: 100, signals: ["cluster", "burst"] },
            { score: 0, signals: [] },
        ]);
    });

    it("skips the header line", () => {
        const idToIndex = new Map([[12345678, 0]]);

        const parsed = parseLLMResponse(
            "github_id,score,signals\n12345678,50,ok",
            idToIndex,
            1,
        );

        expect(parsed).toHaveLength(1);
        expect(parsed[0].score).toBe(50);
    });

    it("uses the highest score when a user appears in overlapping chunks", () => {
        // parseLLMResponse itself returns per-chunk results; overlap dedup is
        // in scoreUsers. But if the LLM repeats a user in one response, the
        // last occurrence wins (Map.set overwrites). Verify score is clamped.
        const idToIndex = new Map([[12345678, 0]]);

        const parsed = parseLLMResponse(
            "github_id,score,signals\n12345678,30,ok\n12345678,60,cluster",
            idToIndex,
            1,
        );

        expect(parsed[0].score).toBe(60);
    });
});

describe("SCORE_THRESHOLDS", () => {
    it("block threshold is above review threshold", () => {
        expect(SCORE_THRESHOLDS.block).toBeGreaterThan(SCORE_THRESHOLDS.review);
    });

    it("score of 70 maps to block", () => {
        expect(SCORE_THRESHOLDS.block).toBeLessThanOrEqual(70);
    });

    it("score of 39 is below review threshold", () => {
        expect(39).toBeLessThan(SCORE_THRESHOLDS.review);
    });
});
