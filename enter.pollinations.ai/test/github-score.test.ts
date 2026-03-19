import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/user-pipeline/shared/github-identity.ts", () => ({
    PIPELINE_DB_BATCH_SIZE: 200,
    GITHUB_ACCOUNT_DELETED_REASON: "github_account_deleted",
}));

const { executeD1 } = vi.hoisted(() => ({
    executeD1: vi.fn(() => true),
}));

vi.mock("../scripts/user-pipeline/shared/d1.ts", () => ({
    executeD1,
}));

import {
    buildQuery,
    extractDeletedGithubIds,
    isScorableValidationResult,
    scoreUser,
    storeGithubScores,
} from "../scripts/user-pipeline/scoring/github-score.ts";

describe("github-score", () => {
    beforeEach(() => {
        executeD1.mockClear();
    });

    it("builds a node-id GraphQL query", () => {
        const query = buildQuery([{ node_id: "NODE_123" }]);
        expect(query).toContain('u0: node(id: "NODE_123")');
        expect(query).toContain("contributionsCollection");
    });

    it("scores a valid user record", () => {
        const result = scoreUser(
            {
                __typename: "User",
                createdAt: "2024-01-01T00:00:00Z",
                repositories: {
                    totalCount: 3,
                    nodes: [
                        {
                            stargazerCount: 10,
                            diskUsage: 100,
                            createdAt: "2024-01-01T00:00:00Z",
                        },
                        {
                            stargazerCount: 5,
                            diskUsage: 50,
                            createdAt: "2024-01-01T00:00:00Z",
                        },
                    ],
                },
                contributionsCollection: {
                    totalCommitContributions: 50,
                },
            },
            123,
        );

        expect(result.github_id).toBe(123);
        expect(result.status).toBe("ok");
        expect(result.approved).toBe(true);
        expect(result.details?.total).toBeGreaterThanOrEqual(8);
    });

    it("marks deleted accounts", () => {
        const result = scoreUser(null, 456);
        expect(result).toEqual({
            github_id: 456,
            status: "github_account_deleted",
            approved: false,
            reason: "GitHub account deleted",
            details: null,
            risk_status: "unavailable",
            risk_flags: [],
            risk_details: null,
        });
    });

    it("extracts deleted github ids", () => {
        expect(
            extractDeletedGithubIds([
                { github_id: 1, status: "github_account_deleted" },
                { github_id: 2, status: "ok" },
                { github_id: 1, status: "github_account_deleted" },
            ]),
        ).toEqual([1]);
    });

    it("does not treat unavailable results as scoreable", () => {
        expect(
            isScorableValidationResult({
                github_id: 123,
                status: "unavailable",
                approved: false,
                reason: "GitHub scoring unavailable",
                details: null,
                risk_status: "unavailable",
                risk_flags: [],
                risk_details: null,
            }),
        ).toBe(false);
    });

    it("stores finite scores for valid github ids only", () => {
        const stored = storeGithubScores(
            "staging",
            "spore",
            [
                {
                    github_id: 123,
                    status: "ok",
                    approved: true,
                    reason: "ok",
                    details: { total: 9 } as never,
                    risk_status: "ok",
                    risk_flags: [],
                    risk_details: null,
                },
                {
                    github_id: 456,
                    status: "ok",
                    approved: false,
                    reason: "ok",
                    details: { total: Number.NaN } as never,
                    risk_status: "ok",
                    risk_flags: [],
                    risk_details: null,
                },
                {
                    github_id: null,
                    status: "unavailable",
                    approved: false,
                    reason: "skip",
                    details: null,
                    risk_status: "unavailable",
                    risk_flags: [],
                    risk_details: null,
                },
            ],
            { timestamp: 1234567890 },
        );

        expect(stored).toBe(2);
        expect(executeD1).toHaveBeenCalledTimes(1);
        expect(executeD1.mock.calls[0][1]).toContain("WHEN 123 THEN 9");
        expect(executeD1.mock.calls[0][1]).toContain("WHEN 456 THEN 0");
        expect(executeD1.mock.calls[0][1]).toContain("tier = 'spore'");
    });
});
