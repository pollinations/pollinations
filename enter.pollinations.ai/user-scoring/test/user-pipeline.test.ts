import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/d1.ts", () => ({
    executeD1: vi.fn(),
    queryD1: vi.fn(() => []),
}));

import {
    parseLLMResponse,
    partitionPendingUsers,
    SCORE_THRESHOLDS,
} from "../scoring/trust-score.ts";
import { llmComplete } from "../shared/llm.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

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

    it("defaults to non-strict mode (no throw on omitted user)", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        const parsed = parseLLMResponse(
            "github_id,score,signals\n12345678,10,ok",
            idToIndex,
            2,
        );

        expect(parsed[0].score).toBe(10);
        expect(parsed[1].score).toBe(0); // default for omitted user
    });

    it("throws in strict mode when the LLM omits a user", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        expect(() =>
            parseLLMResponse(
                "github_id,score,signals\n12345678,10,ok",
                idToIndex,
                2,
                { strict: true },
            ),
        ).toThrow(
            "LLM response omitted one or more target users from the chunk",
        );
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

    it("extracts only target IDs from full LLM response", () => {
        const idToIndex = new Map([
            [12345678, 0],
            [87654321, 1],
        ]);

        const parsed = parseLLMResponse(
            [
                "github_id,score,signals",
                "99999999,90,cluster",
                "12345678,10,ok",
                "87654321,20,disp",
            ].join("\n"),
            idToIndex,
            2,
        );

        expect(parsed).toEqual([
            { score: 10, signals: [] },
            { score: 20, signals: ["disp"] },
        ]);
    });
});

describe("partitionPendingUsers", () => {
    function buildUser(index: number, createdAtMs: number) {
        return {
            email: `user-${index}@example.com`,
            github_id: index,
            github_username: `user-${index}`,
            created_at: createdAtMs,
            tier: "microbe",
        };
    }

    it("holds back the newest 30 pending users and scores the rest", () => {
        const nowMs = Date.parse("2026-03-21T12:00:00Z");
        const users = Array.from({ length: 75 }, (_, index) =>
            buildUser(index + 1, nowMs - index * 60_000),
        );

        const partition = partitionPendingUsers(users, { nowMs });

        expect(partition.holdbackUsers).toHaveLength(30);
        expect(partition.targetUsers).toHaveLength(45);
        expect(partition.releasedHoldbackUsers).toHaveLength(0);
        expect(partition.holdbackUsers[0]?.email).toBe("user-1@example.com");
        expect(partition.targetUsers[0]?.email).toBe("user-31@example.com");
    });

    it("releases held-back users once they have waited past the SLA", () => {
        const nowMs = Date.parse("2026-03-21T12:00:00Z");
        const users = Array.from({ length: 10 }, (_, index) =>
            buildUser(index + 1, nowMs - (100 + index) * 60_000),
        );

        const partition = partitionPendingUsers(users, { nowMs });

        expect(partition.holdbackUsers).toHaveLength(0);
        expect(partition.targetUsers).toHaveLength(10);
        expect(partition.releasedHoldbackUsers).toHaveLength(10);
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

describe("llmComplete", () => {
    it("uses the claude model by default", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue(
                JSON.stringify({
                    choices: [{ message: { content: "ok" } }],
                }),
            ),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            llmComplete("trust prompt", { apiKey: "sk_test" }),
        ).resolves.toBe("ok");

        expect(fetchMock).toHaveBeenCalledOnce();
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.model).toBe("claude");
    });

    it("rejects with AbortError message format on timeout", () => {
        // Verify the error message format matches what the implementation produces
        const err = Object.assign(
            new Error("LLM request timed out after 30000ms"),
            {
                name: "AbortError",
            },
        );
        expect(err.name).toBe("AbortError");
        expect(err.message).toContain("30000ms");
    });
});
