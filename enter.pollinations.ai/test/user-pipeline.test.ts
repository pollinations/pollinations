import { describe, expect, it, vi } from "vitest";

vi.mock("../scripts/user-pipeline/shared/d1.ts", () => ({
    executeD1: vi.fn(),
    queryD1: vi.fn(() => []),
}));

import { parseLLMResponse } from "../scripts/user-pipeline/scoring/trust-score.ts";

describe("parseLLMResponse", () => {
    it("parses CSV rows and clamps scores", () => {
        const githubToIndex = new Map([
            ["alice", 0],
            ["bob", 1],
        ]);

        const parsed = parseLLMResponse(
            "github,score,signals\nalice,120,cluster+burst\nbob,-5,ok",
            githubToIndex,
            2,
        );

        expect(parsed).toEqual([
            { score: 100, signals: ["cluster", "burst"] },
            { score: 0, signals: [] },
        ]);
    });

    it("throws when the LLM omits a user", () => {
        const githubToIndex = new Map([
            ["alice", 0],
            ["bob", 1],
        ]);

        expect(() =>
            parseLLMResponse(
                "github,score,signals\nalice,10,ok",
                githubToIndex,
                2,
            ),
        ).toThrow("LLM response omitted one or more users from the chunk");
    });

    it("ignores trailing prose after valid CSV rows", () => {
        const githubToIndex = new Map([
            ["alice", 0],
            ["bob", 1],
        ]);

        const parsed = parseLLMResponse(
            [
                "github,score,signals",
                "alice,100,cluster+burst",
                "bob,0,",
                "",
                "---",
                "### Analysis Summary",
                "The main suspicious cluster is alice.",
            ].join("\n"),
            githubToIndex,
            2,
        );

        expect(parsed).toEqual([
            { score: 100, signals: ["cluster", "burst"] },
            { score: 0, signals: [] },
        ]);
    });
});
