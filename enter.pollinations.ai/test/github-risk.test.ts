import { describe, expect, it } from "vitest";
import { assessProfileRisk } from "../scripts/user-pipeline/scoring/github-risk.ts";

describe("assessProfileRisk", () => {
    it("flags bursty empty repositories", () => {
        const recent = new Date().toISOString();
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 8,
                    nodes: Array.from({ length: 5 }, () => ({
                        diskUsage: 0,
                        createdAt: recent,
                    })),
                },
            },
            101,
        );

        expect(result.risk_status).toBe("suspicious");
        expect(result.risk_flags).toContain("burst_empty_repos");
    });

    it("keeps normal profiles clear", () => {
        const result = assessProfileRisk(
            {
                repositories: {
                    totalCount: 4,
                    nodes: [
                        { diskUsage: 120, createdAt: "2024-01-01T00:00:00Z" },
                        { diskUsage: 80, createdAt: "2024-01-01T00:00:00Z" },
                        { diskUsage: 50, createdAt: "2024-01-01T00:00:00Z" },
                        { diskUsage: 0, createdAt: "2024-01-01T00:00:00Z" },
                    ],
                },
            },
            202,
        );

        expect(result.risk_status).toBe("ok");
        expect(result.risk_flags).toEqual([]);
    });
});
