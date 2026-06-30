import {
    assertStagingAccess,
    parseStagingUserIdList,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { describe, expect, it } from "vitest";

describe("parseStagingUserIdList", () => {
    it("parses a comma-separated list of user ids", () => {
        const ids = parseStagingUserIdList("abc123,def456");
        expect(ids.has("abc123")).toBe(true);
        expect(ids.has("def456")).toBe(true);
        expect(ids.size).toBe(2);
    });

    it("trims surrounding whitespace around entries", () => {
        const ids = parseStagingUserIdList("  abc123 ,   def456  ");
        expect(ids.has("abc123")).toBe(true);
        expect(ids.has("def456")).toBe(true);
    });

    it("drops blank and whitespace-containing entries", () => {
        const ids = parseStagingUserIdList("abc123,,bad id,def456");
        expect(Array.from(ids).sort()).toEqual(["abc123", "def456"]);
    });

    it("returns an empty set for empty / null / undefined", () => {
        expect(parseStagingUserIdList("").size).toBe(0);
        expect(parseStagingUserIdList(null).size).toBe(0);
        expect(parseStagingUserIdList(undefined).size).toBe(0);
    });
});

describe("assertStagingAccess", () => {
    const allowlist = "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh,abc123";

    it("is a no-op outside staging, even with no allowlist", () => {
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "production" }, { id: "nope" }),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "local" }, { id: null }),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "dev" }, null),
        ).not.toThrow();
    });

    it("allows users whose id is in the staging allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: allowlist },
                { id: "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh" },
            ),
        ).not.toThrow();
    });

    it("denies users whose id is not in the allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: allowlist },
                { id: "someone-else" },
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies users with missing or null id (fails closed)", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: allowlist },
                { id: null },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: allowlist },
                {},
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: allowlist },
                null,
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies everyone when the allowlist is empty or missing on staging", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_USER_IDS: "" },
                { id: "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh" },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging" },
                { id: "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh" },
            ),
        ).toThrow(StagingAccessDeniedError);
    });
});
