import { describe, expect, it } from "vitest";
import { assessProfileRisk } from "./github-risk.ts";

describe("assessProfileRisk", () => {
    it("flags bursty empty repositories", () => {
        const recent = new Date().toISOString();
        const data = {
            repositories: {
                totalCount: 8,
                nodes: Array.from({ length: 5 }, () => ({
                    diskUsage: 0,
                    createdAt: recent,
                    stargazerCount: 0,
                })),
            },
        };

        const result = assessProfileRisk(data, "burst-bot");

        expect(result.risk_status).toBe("suspicious");
        expect(result.risk_flags).toContain("burst_empty_repos");
    });

    it("keeps normal profiles clear", () => {
        const older = "2024-01-01T00:00:00Z";
        const data = {
            repositories: {
                totalCount: 4,
                nodes: [
                    { diskUsage: 120, createdAt: older, stargazerCount: 5 },
                    { diskUsage: 80, createdAt: older, stargazerCount: 2 },
                    { diskUsage: 50, createdAt: older, stargazerCount: 0 },
                    { diskUsage: 0, createdAt: older, stargazerCount: 0 },
                ],
            },
        };

        const result = assessProfileRisk(data, "healthy-user");

        expect(result.risk_status).toBe("ok");
        expect(result.risk_flags).toEqual([]);
    });

    it("returns unavailable for null data", () => {
        const result = assessProfileRisk(null, "unknown");
        expect(result.risk_status).toBe("unavailable");
        expect(result.risk_flags).toEqual([]);
        expect(result.risk_details).toBeNull();
    });
});
