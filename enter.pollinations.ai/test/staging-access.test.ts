import {
    assertStagingAccess,
    parseStagingEmailList,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { describe, expect, it } from "vitest";

describe("parseStagingEmailList", () => {
    it("parses a comma-separated list of emails", () => {
        const emails = parseStagingEmailList(
            "elliot@myceli.ai,thomash@myceli.ai",
        );
        expect(emails.has("elliot@myceli.ai")).toBe(true);
        expect(emails.has("thomash@myceli.ai")).toBe(true);
        expect(emails.size).toBe(2);
    });

    it("trims whitespace and lowercases entries", () => {
        const emails = parseStagingEmailList(
            "  Elliot@MYCELI.ai ,   ThomasH@myceli.ai  ",
        );
        expect(emails.has("elliot@myceli.ai")).toBe(true);
        expect(emails.has("thomash@myceli.ai")).toBe(true);
    });

    it("drops malformed, empty, and whitespace-containing entries", () => {
        const emails = parseStagingEmailList(
            "elliot@myceli.ai,abc,,bad value,thomash@myceli.ai",
        );
        expect(Array.from(emails).sort()).toEqual([
            "elliot@myceli.ai",
            "thomash@myceli.ai",
        ]);
    });

    it("returns an empty set for empty / null / undefined", () => {
        expect(parseStagingEmailList("").size).toBe(0);
        expect(parseStagingEmailList(null).size).toBe(0);
        expect(parseStagingEmailList(undefined).size).toBe(0);
    });
});

describe("assertStagingAccess", () => {
    const allowlist = "elliot@myceli.ai,thomash@myceli.ai";

    it("is a no-op outside staging, even with no allowlist", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "production" },
                { email: "unknown@example.com", emailVerified: false },
            ),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "local" },
                { email: null, emailVerified: null },
            ),
        ).not.toThrow();
        expect(() =>
            assertStagingAccess({ ENVIRONMENT: "dev" }, null),
        ).not.toThrow();
    });

    it("allows users whose verified email is in the staging allowlist", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                { email: "Elliot@MYCELI.ai", emailVerified: true },
            ),
        ).not.toThrow();
    });

    it("denies users whose email is not in the allowlist", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                { email: "unknown@example.com", emailVerified: true },
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies users with unverified email", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                { email: "elliot@myceli.ai", emailVerified: false },
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies users with missing or null email (fails closed)", () => {
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                { email: null, emailVerified: true },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                {},
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                {
                    ENVIRONMENT: "staging",
                    STAGING_ALLOWED_EMAILS: allowlist,
                },
                null,
            ),
        ).toThrow(StagingAccessDeniedError);
    });

    it("denies everyone when the allowlist is empty or missing on staging", () => {
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging", STAGING_ALLOWED_EMAILS: "" },
                { email: "elliot@myceli.ai", emailVerified: true },
            ),
        ).toThrow(StagingAccessDeniedError);
        expect(() =>
            assertStagingAccess(
                { ENVIRONMENT: "staging" },
                { email: "elliot@myceli.ai", emailVerified: true },
            ),
        ).toThrow(StagingAccessDeniedError);
    });
});
