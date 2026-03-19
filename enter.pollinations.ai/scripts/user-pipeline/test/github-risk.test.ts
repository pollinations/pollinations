import { describe, expect, it } from "vitest";
import { assessProfileRisk } from "../scoring/github-risk.ts";

function recentDate(): string {
    return new Date().toISOString();
}

function oldDate(): string {
    return "2024-01-01T00:00:00Z";
}

describe("assessProfileRisk", () => {
    it("flags burst_empty_repos when 5+ empty repos created within the last 7 days", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 8,
                    nodes: Array.from({ length: 5 }, () => ({
                        diskUsage: 0,
                        createdAt: recentDate(),
                    })),
                },
            },
            101,
        );

        expect(result.risk_status).toBe("suspicious");
        expect(result.risk_flags).toContain("burst_empty_repos");
    });

    it("does not flag burst_empty_repos when empty repos are old", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 8,
                    nodes: Array.from({ length: 5 }, () => ({
                        diskUsage: 0,
                        createdAt: oldDate(),
                    })),
                },
            },
            102,
        );

        expect(result.risk_flags).not.toContain("burst_empty_repos");
    });

    it("flags empty_repo_dominance when >20 total repos and >80% fetched are empty", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 25,
                    nodes: [
                        ...Array.from({ length: 9 }, () => ({
                            diskUsage: 0,
                            createdAt: oldDate(),
                        })),
                        { diskUsage: 100, createdAt: oldDate() },
                    ],
                },
            },
            103,
        );

        expect(result.risk_status).toBe("suspicious");
        expect(result.risk_flags).toContain("empty_repo_dominance");
    });

    it("flags repo_quality_gap when >20 total repos but fewer than 3 quality repos fetched", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 25,
                    nodes: [
                        { diskUsage: 100, createdAt: oldDate() },
                        { diskUsage: 0, createdAt: oldDate() },
                        { diskUsage: 0, createdAt: oldDate() },
                        { diskUsage: 0, createdAt: oldDate() },
                    ],
                },
            },
            104,
        );

        expect(result.risk_flags).toContain("repo_quality_gap");
    });

    it("does not flag repo_quality_gap when zero repos were fetched", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 25,
                    nodes: [],
                },
            },
            105,
        );

        expect(result.risk_flags).not.toContain("repo_quality_gap");
        expect(result.risk_status).toBe("ok");
    });

    it("keeps normal profiles clear", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 4,
                    nodes: [
                        { diskUsage: 120, createdAt: oldDate() },
                        { diskUsage: 80, createdAt: oldDate() },
                        { diskUsage: 50, createdAt: oldDate() },
                        { diskUsage: 0, createdAt: oldDate() },
                    ],
                },
            },
            202,
        );

        expect(result.risk_status).toBe("ok");
        expect(result.risk_flags).toEqual([]);
    });

    it("returns unavailable when data is null", () => {
        const result = assessProfileRisk(null, 999);

        expect(result.risk_status).toBe("unavailable");
        expect(result.risk_flags).toEqual([]);
        expect(result.risk_details).toBeNull();
    });

    it("returns unavailable when repositories is missing", () => {
        const result = assessProfileRisk({}, 999);

        expect(result.risk_status).toBe("ok"); // no flags without data to flag
        expect(result.risk_details?.fetched_repos).toBe(0);
    });

    it("includes github_id in the result", () => {
        const result = assessProfileRisk(
            { repositories: { totalCount: 0, nodes: [] } },
            42,
        );
        expect(result.github_id).toBe(42);
    });

    it("populates risk_details with accurate counts", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 10,
                    nodes: [
                        { diskUsage: 0, createdAt: recentDate() },
                        { diskUsage: 0, createdAt: recentDate() },
                        { diskUsage: 100, createdAt: oldDate() },
                    ],
                },
            },
            55,
        );

        expect(result.risk_details).toMatchObject({
            total_repos: 10,
            fetched_repos: 3,
            empty_fetched_repos: 2,
            quality_fetched_repos: 1,
        });
    });
});
