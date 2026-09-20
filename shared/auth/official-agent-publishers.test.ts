import { describe, expect, it } from "vitest";
import {
    isOfficialAgentPublisherGithubId,
    OFFICIAL_AGENT_PUBLISHER_GITHUB_IDS,
} from "./official-agent-publishers.ts";

describe("isOfficialAgentPublisherGithubId", () => {
    it("accepts configured official publisher ids", () => {
        for (const id of OFFICIAL_AGENT_PUBLISHER_GITHUB_IDS) {
            expect(isOfficialAgentPublisherGithubId(id)).toBe(true);
        }
    });

    it("rejects null, non-integers and unknown ids", () => {
        expect(isOfficialAgentPublisherGithubId(null)).toBe(false);
        expect(isOfficialAgentPublisherGithubId(undefined)).toBe(false);
        expect(isOfficialAgentPublisherGithubId(1.5)).toBe(false);
        expect(isOfficialAgentPublisherGithubId(123)).toBe(false);
    });
});
