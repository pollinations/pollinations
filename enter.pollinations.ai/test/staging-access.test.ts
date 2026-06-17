import {
    assertStagingAccess,
    parseGithubIdList,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { describe, expect, it } from "vitest";

describe("parseGithubIdList", () => {
    it("parses a comma-separated list of numeric IDs", () => {
        const ids = parseGithubIdList("36901823,5099901");
        expect(ids.has(36901823)).toBe(true);
        expect(ids.has(5099901)).toBe(true);
        expect(ids.size).toBe(2);
    });

    it("trims whitespace around entries", () => {
        const ids = parseGithubIdList("  36901823 ,   5099901  ");
        expect(ids.has(36901823)).toBe(true);
        expect(ids.has(5099901)).toBe(true);
    });

    it("drops non-numeric, empty, and non-positive entries", () => {
        const ids = parseGithubIdList("36901823,abc,,-1,0,5099901");
        expect(Array.from(ids).sort((a, b) => a - b)).toEqual([
            5099901, 36901823,
        ]);
    });

    it("strictly drops mixed entries like '123abc' (not silently truncated)", () => {
        const ids = parseGithubIdList("123abc,4567");
        expect(ids.has(123)).toBe(false);
        expect(ids.has(4567)).toBe(true);
        expect(ids.size).toBe(1);
    });

    it("returns an empty set for empty / null / undefined", () => {
        expect(parseGithubIdList("").size).toBe(0);
        expect(parseGithubIdList(null).size).toBe(0);
        expect(parseGithubIdList(undefined).size).toBe(0);
    });
});

describe("assertStagingAccess", () => {
    it("is a no-op outside staging, even with no allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "production" },
                { githubId: 99 },
            ),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "local" }, { githubId: null }),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "dev" }, null),
        ).not.toThrow();
    });

    it("allows users whose githubId is in the shared rollout allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging" },
                { githubId: 36901823 },
            ),
        ).not.toThrow();
    });

    it("denies users whose githubId is not in the allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging" },
                { githubId: 99999 },
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies users with missing or null githubId (fails closed)", () => {
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "staging" }, { githubId: null }),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "staging" }, {}),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "staging" }, null),
        ).toThrow(StagingAccessDeniedError);
    });
});
