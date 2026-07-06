import {
    assertStagingAccess,
    parseEmailList,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { parseGithubIdList } from "@shared/auth/github-id-list.ts";
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
    const allowlist = "36901823,5099901";
    const emailAllowlist = "elliot@pollinations.ai";

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

    it("allows users whose githubId is in the staging allowlist", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                },
                { githubId: 36901823 },
            ),
        ).not.toThrow();
    });

    it("allows users whose email is in the staging email allowlist", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                    STAGING_ALLOWED_EMAILS: emailAllowlist,
                },
                { githubId: 99999, email: " Elliot@Pollinations.AI " },
            ),
        ).not.toThrow();
    });

    it("denies users whose githubId is not in the allowlist", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                    STAGING_ALLOWED_EMAILS: emailAllowlist,
                },
                { githubId: 99999, email: "not-elliot@pollinations.ai" },
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies users with missing or null githubId (fails closed)", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                },
                { githubId: null },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                },
                {},
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_GITHUB_IDS: allowlist,
                },
                null,
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies everyone when the allowlist is empty or missing on staging", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_GITHUB_IDS: "" },
                { githubId: 36901823 },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging" },
                { githubId: 36901823 },
            ),
        ).toThrow(StagingAccessDeniedError);
    });
});

describe("parseEmailList", () => {
    it("parses and normalizes comma-separated emails", () => {
        expect(
            parseEmailList(" Elliot@Pollinations.AI, team@pollinations.ai "),
        ).toEqual(new Set(["elliot@pollinations.ai", "team@pollinations.ai"]));
    });

    it("drops entries that are not emails", () => {
        expect(parseEmailList("elliot, ,team@pollinations.ai")).toEqual(
            new Set(["team@pollinations.ai"]),
        );
    });
});
