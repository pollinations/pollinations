import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/github-identity.ts", () => ({
    PIPELINE_DB_BATCH_SIZE: 200,
    GITHUB_ACCOUNT_DELETED_REASON: "github_account_deleted",
}));

const { executeD1 } = vi.hoisted(() => ({
    executeD1: vi.fn(() => true),
}));

const { githubGraphqlRequest, githubRestRequest } = vi.hoisted(() => ({
    githubGraphqlRequest: vi.fn(),
    githubRestRequest: vi.fn(),
}));

vi.mock("../shared/d1.ts", () => ({
    executeD1,
}));

vi.mock("../shared/github.ts", () => ({
    githubGraphqlRequest,
    githubRestRequest,
}));

import {
    buildQuery,
    extractDeletedGithubIds,
    isScorableValidationResult,
    scoreUser,
    storeGithubScores,
    validateAccountRecords,
    validateUserRecords,
} from "../scoring/github-score.ts";

beforeEach(() => {
    executeD1.mockClear();
    githubGraphqlRequest.mockReset();
    githubRestRequest.mockReset();
});

function makeUser(
    overrides: {
        ageDays?: number;
        qualityRepos?: number;
        commits?: number;
        stars?: number;
    } = {},
) {
    const {
        ageDays = 365,
        qualityRepos = 3,
        commits = 50,
        stars = 5,
    } = overrides;
    const createdAt = new Date(
        Date.now() - ageDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    return {
        __typename: "User" as const,
        createdAt,
        repositories: {
            totalCount: qualityRepos,
            nodes: Array.from({ length: qualityRepos }, () => ({
                stargazerCount: Math.floor(stars / qualityRepos),
                diskUsage: 100,
                createdAt,
            })),
        },
        contributionsCollection: {
            totalCommitContributions: commits,
        },
    };
}

describe("buildQuery", () => {
    it("builds a node-id GraphQL query for each account", () => {
        const query = buildQuery([{ node_id: "NODE_123" }]);
        expect(query).toContain('u0: node(id: "NODE_123")');
        expect(query).toContain("contributionsCollection");
    });

    it("includes all accounts in the query", () => {
        const query = buildQuery([
            { node_id: "NODE_A" },
            { node_id: "NODE_B" },
        ]);
        expect(query).toContain("u0:");
        expect(query).toContain("u1:");
    });

    it("escapes double quotes in node_id", () => {
        const query = buildQuery([{ node_id: 'NODE_"BAD"' }]);
        expect(query).toContain('\\"BAD\\"');
    });
});

describe("scoreUser", () => {
    it("scores a valid user and returns approved=true when total >= 8", () => {
        const result = scoreUser(
            makeUser({ ageDays: 730, qualityRepos: 3, commits: 80, stars: 20 }),
            123,
        );

        expect(result.github_id).toBe(123);
        expect(result.status).toBe("ok");
        expect(result.approved).toBe(true);
        expect(result.details?.total).toBeGreaterThanOrEqual(8);
    });

    it("returns approved=false when total < 8", () => {
        // New account, no repos, no commits, no stars
        const result = scoreUser(
            makeUser({ ageDays: 1, qualityRepos: 0, commits: 0, stars: 0 }),
            456,
        );

        expect(result.approved).toBe(false);
        expect(result.details?.total).toBeLessThan(8);
    });

    it("caps each scoring dimension at its maximum", () => {
        // Very old account (>360 days) should cap age at 6pts
        const result = scoreUser(
            makeUser({ ageDays: 9999, qualityRepos: 0, commits: 0, stars: 0 }),
            789,
        );

        expect(result.details?.age_pts).toBeCloseTo(6, 1);
    });

    it("marks deleted accounts when data is null", () => {
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

    it("ignores repos with zero diskUsage in quality count", () => {
        const data = {
            __typename: "User" as const,
            createdAt: new Date(
                Date.now() - 365 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            repositories: {
                totalCount: 5,
                nodes: [
                    {
                        stargazerCount: 0,
                        diskUsage: 0,
                        createdAt: "2024-01-01T00:00:00Z",
                    },
                    {
                        stargazerCount: 0,
                        diskUsage: 0,
                        createdAt: "2024-01-01T00:00:00Z",
                    },
                    {
                        stargazerCount: 5,
                        diskUsage: 200,
                        createdAt: "2024-01-01T00:00:00Z",
                    },
                ],
            },
            contributionsCollection: { totalCommitContributions: 0 },
        };

        const result = scoreUser(data, 100);
        expect(result.details?.quality_repos).toBe(1);
        expect(result.details?.repos).toBe(1);
    });
});

describe("extractDeletedGithubIds", () => {
    it("returns unique deleted github ids", () => {
        expect(
            extractDeletedGithubIds([
                { github_id: 1, status: "github_account_deleted" },
                { github_id: 2, status: "ok" },
                { github_id: 1, status: "github_account_deleted" },
            ]),
        ).toEqual([1]);
    });

    it("excludes null github_ids", () => {
        expect(
            extractDeletedGithubIds([
                { github_id: null, status: "github_account_deleted" },
            ]),
        ).toEqual([]);
    });

    it("returns empty array when no deleted accounts", () => {
        expect(
            extractDeletedGithubIds([
                { github_id: 1, status: "ok" },
                { github_id: 2, status: "unavailable" },
            ]),
        ).toEqual([]);
    });
});

describe("validateAccountRecords", () => {
    it("marks 404 account lookups as deleted", async () => {
        githubRestRequest.mockResolvedValue({
            data: null,
            status: 404,
            remaining: null,
            reset: null,
            total: null,
        });

        await expect(
            validateAccountRecords([{ github_id: 123 }]),
        ).resolves.toEqual([
            {
                github_id: 123,
                node_id: null,
                status: "github_account_deleted",
                reason: "GitHub account deleted",
            },
        ]);
    });

    it("marks non-404 account lookup failures as unavailable", async () => {
        githubRestRequest.mockResolvedValue({
            data: null,
            status: 503,
            remaining: null,
            reset: null,
            total: null,
        });

        await expect(
            validateAccountRecords([{ github_id: 123 }]),
        ).resolves.toEqual([
            {
                github_id: 123,
                node_id: null,
                status: "unavailable",
                reason: "GitHub account lookup failed: HTTP 503",
            },
        ]);
    });
});

describe("validateUserRecords", () => {
    it("defers users when GitHub account lookup is unavailable", async () => {
        githubRestRequest.mockResolvedValue({
            data: null,
            status: 503,
            remaining: null,
            reset: null,
            total: null,
        });

        await expect(
            validateUserRecords([{ github_id: 123 }]),
        ).resolves.toEqual([
            {
                github_id: 123,
                status: "unavailable",
                approved: false,
                reason: "GitHub account lookup failed: HTTP 503",
                details: null,
                risk_status: "unavailable",
                risk_flags: [],
                risk_details: null,
            },
        ]);
        expect(githubGraphqlRequest).not.toHaveBeenCalled();
    });
});

describe("isScorableValidationResult", () => {
    it("returns true for ok status with valid github_id", () => {
        expect(
            isScorableValidationResult({
                github_id: 123,
                status: "ok",
                approved: true,
                reason: "8.0 pts",
                details: null,
                risk_status: "ok",
                risk_flags: [],
                risk_details: null,
            }),
        ).toBe(true);
    });

    it("returns false for unavailable status", () => {
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

    it("returns false for deleted status", () => {
        expect(
            isScorableValidationResult({
                github_id: 123,
                status: "github_account_deleted",
                approved: false,
                reason: "GitHub account deleted",
                details: null,
                risk_status: "unavailable",
                risk_flags: [],
                risk_details: null,
            }),
        ).toBe(false);
    });

    it("returns false when github_id is null", () => {
        expect(
            isScorableValidationResult({
                github_id: null,
                status: "ok",
                approved: false,
                reason: "skip",
                details: null,
                risk_status: "unavailable",
                risk_flags: [],
                risk_details: null,
            }),
        ).toBe(false);
    });
});

describe("storeGithubScores", () => {
    it("stores finite scores and skips NaN scores", () => {
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
            ],
            { timestamp: 1234567890 },
        );

        expect(stored).toBe(2); // both rows stored, NaN is replaced with 0
        expect(executeD1).toHaveBeenCalledTimes(1);
        expect(executeD1.mock.calls[0][1]).toContain("WHEN 123 THEN 9");
        expect(executeD1.mock.calls[0][1]).toContain("WHEN 456 THEN 0"); // NaN → 0
        expect(executeD1.mock.calls[0][1]).toContain("tier = 'spore'");
    });

    it("skips results with null or invalid github_id", () => {
        const stored = storeGithubScores(
            "staging",
            "spore",
            [
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

        expect(stored).toBe(0);
        expect(executeD1).not.toHaveBeenCalled();
    });

    it("calls onBatchStored callback with running total", () => {
        const onBatchStored = vi.fn();

        storeGithubScores(
            "staging",
            "microbe",
            [
                {
                    github_id: 1,
                    status: "ok",
                    approved: true,
                    reason: "ok",
                    details: { total: 10 } as never,
                    risk_status: "ok",
                    risk_flags: [],
                    risk_details: null,
                },
            ],
            { timestamp: 1234567890, onBatchStored },
        );

        expect(onBatchStored).toHaveBeenCalledWith(1, 1);
    });

    it("uses the correct tier in the SQL update", () => {
        storeGithubScores(
            "staging",
            "microbe",
            [
                {
                    github_id: 99,
                    status: "ok",
                    approved: true,
                    reason: "ok",
                    details: { total: 8 } as never,
                    risk_status: "ok",
                    risk_flags: [],
                    risk_details: null,
                },
            ],
            { timestamp: 1234567890 },
        );

        expect(executeD1.mock.calls[0][1]).toContain("tier = 'microbe'");
    });
});
