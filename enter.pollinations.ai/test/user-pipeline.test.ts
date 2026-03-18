import { describe, expect, it } from "vitest";
import { parseLLMResponse } from "../scripts/user-pipeline/scoring/trust-score-helpers.ts";

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
});
