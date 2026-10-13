import { describe, expect, it } from "vitest";
import {
    assertSha,
    costRecord,
    fixBranchName,
    guardPush,
    parsePrUrl,
    sanitize,
    slugify,
} from "./review-fix.mjs";

describe("parsePrUrl", () => {
    it("parses a pull URL", () => {
        expect(
            parsePrUrl(
                "https://github.com/pollinations/pollinations/pull/17241",
            ),
        ).toEqual({
            owner: "pollinations",
            repo: "pollinations",
            number: 17241,
        });
    });

    it("rejects non-PR URLs", () => {
        expect(() => parsePrUrl("https://example.com/x")).toThrow();
        expect(() => parsePrUrl("not a url")).toThrow();
    });

    it("rejects issues URLs instead of remapping them", () => {
        expect(() =>
            parsePrUrl(
                "https://github.com/pollinations/pollinations/issues/17241",
            ),
        ).toThrow();
    });
});

describe("assertSha", () => {
    it("accepts a 40-char hex SHA", () => {
        const sha = "254a87b1543c2a6e658894fcf681383db501f5b1";
        expect(assertSha(sha)).toBe(sha);
    });

    it("rejects short prefixes and non-hex", () => {
        expect(() => assertSha("254a87b")).toThrow();
        expect(() => assertSha("z".repeat(40))).toThrow();
    });
});

describe("fixBranchName", () => {
    it("builds the fork branch name", () => {
        expect(fixBranchName(17241, "Expires In Decimal")).toBe(
            "fix/17245-17241-expires-in-decimal",
        );
    });

    it("rejects bad PR numbers", () => {
        expect(() => fixBranchName(0, "x")).toThrow();
    });
});

describe("guardPush", () => {
    const fork = "https://github.com/patbing/pollinations.git";
    const branch = "fix/17245-17241-expires-in-decimal";

    it("accepts the fork plus quest branch", () => {
        expect(guardPush(fork, branch)).toEqual({ remote: fork, branch });
    });

    it("accepts case variants and URLs without .git", () => {
        expect(
            guardPush("https://github.com/PatBing/pollinations", branch).remote,
        ).toBe("https://github.com/PatBing/pollinations");
        expect(
            guardPush("git@github.com:patbing/pollinations", branch).branch,
        ).toBe(branch);
    });

    it("rejects upstream, other forks and wrong branches", () => {
        expect(() =>
            guardPush(
                "https://github.com/pollinations/pollinations.git",
                branch,
            ),
        ).toThrow();
        expect(() =>
            guardPush("https://github.com/other/pollinations.git", branch),
        ).toThrow();
        expect(() => guardPush(fork, "main")).toThrow();
        expect(() => guardPush(fork, "pr-fix/17241-x")).toThrow();
    });

    it("rejects token-bearing and host-spoofing URLs", () => {
        expect(() =>
            guardPush(
                "https://github.com/patbing/pollinations.git?token=x",
                branch,
            ),
        ).toThrow();
        expect(() =>
            guardPush(
                "https://github.com/patbing/pollinations.git@evil.com",
                branch,
            ),
        ).toThrow();
    });
});
describe("slugify", () => {
    it("falls back to fix on empty input", () => {
        expect(slugify("!!!")).toBe("fix");
    });

    it("trims trailing hyphens after the length cap", () => {
        const s = slugify("a".repeat(39) + "!b");
        expect(s).not.toMatch(/-$/);
        expect(s).toBe("a".repeat(39));
        expect(fixBranchName(1, "a".repeat(39) + "!b")).toMatch(
            /^fix\/17245-1-[a-z0-9-]+$/,
        );
    });
});

describe("sanitize", () => {
    it("redacts OpenAI project keys, lowercase bearer, KEY= assignments, PEM and URL userinfo", () => {
        const out = sanitize(
            "a sk-proj-abcDEF123456 b authorization: bearer xyz123456 c POLLINATIONS_API_KEY=abc123XYZ d -----BEGIN PRIVATE KEY----- e https://x-access-token@github.com/x",
        );
        expect(out).not.toContain("sk-proj-abcDEF123456");
        expect(out).not.toContain("bearer xyz123456");
        expect(out).not.toContain("POLLINATIONS_API_KEY=abc123XYZ");
        expect(out).not.toContain("BEGIN PRIVATE KEY");
        expect(out).not.toContain("x-access-token@github.com");
        expect(out).not.toContain("https://x-access");
    });

    it("redacts full PEM blocks, not just the BEGIN line", () => {
        const pem = [
            "-----BEGIN PRIVATE KEY-----",
            "MIIEvwIBADANBgkqhkiG9w0BAQEFAASC",
            "-----END PRIVATE KEY-----",
        ].join("\n");
        const out = sanitize(`before ${pem} after`);
        expect(out).not.toContain("MIIEvwIBADANBgkqhkiG9w0BAQEFAASC");
        expect(out).not.toContain("END PRIVATE KEY");
        expect(out).toContain("before ");
        expect(out).toContain(" after");
    });
    it("redacts dangling PEM bodies and PGP armor", () => {
        const dangling = "x -----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBg\nmore";
        expect(sanitize(dangling)).not.toContain("MIIEvwIBADANBg");
        const pgp =
            "-----BEGIN PGP PRIVATE KEY BLOCK-----\nQUJD\n-----END PGP PRIVATE KEY BLOCK-----";
        expect(sanitize(`a ${pgp} b`)).not.toContain("QUJD");
        const pgpDangling =
            "x -----BEGIN PGP PRIVATE KEY BLOCK-----\nMIIEvwIBADANBg\nmore";
        expect(sanitize(pgpDangling)).not.toContain("MIIEvwIBADANBg");
    });
    it("leaves ordinary text and plain URLs alone", () => {
        expect(sanitize("hello world")).toBe("hello world");
        expect(
            sanitize("see https://github.com/pollinations/pollinations"),
        ).toBe("see https://github.com/pollinations/pollinations");
    });
});

describe("costRecord", () => {
    const pricing = {
        currency: "pollen",
        promptTextTokens: "0.000002",
        promptCachedTokens: "0.0000001",
        completionTextTokens: "0.00001",
    };

    it("multiplies usage by the rate table", () => {
        const rec = costRecord(
            { prompt_tokens: 1000, completion_tokens: 500 },
            pricing,
        );
        expect(rec.currency).toBe("pollen");
        expect(rec.totalEstimated).toBeCloseTo(
            1000 * 0.000002 + 500 * 0.00001,
            12,
        );
    });

    it("splits cached tokens onto the cached rate", () => {
        const rec = costRecord(
            { prompt_tokens: 1000, completion_tokens: 0, cached_tokens: 200 },
            pricing,
        );
        expect(rec.totalEstimated).toBeCloseTo(
            800 * 0.000002 + 200 * 0.0000001,
            12,
        );
    });

    it("reads nested cached tokens", () => {
        const rec = costRecord(
            {
                prompt_tokens: 1000,
                completion_tokens: 0,
                prompt_tokens_details: { cached_tokens: 400 },
            },
            pricing,
        );
        expect(rec.totalEstimated).toBeCloseTo(
            600 * 0.000002 + 400 * 0.0000001,
            12,
        );
    });

    it("marks unmeasurable categories unknown instead of zero", () => {
        const rec = costRecord({ prompt_tokens: 10, completion_tokens: 5 }, {});
        expect(rec.lines.every((l) => l.cost === "unknown")).toBe(true);
        expect(rec.totalEstimated).toBeNull();
    });

    it("treats null rates and missing usage as unknown", () => {
        const rec = costRecord(
            { prompt_tokens: 10, completion_tokens: 5 },
            {
                currency: "pollen",
                promptTextTokens: null,
                completionTextTokens: "",
            },
        );
        expect(rec.totalEstimated).toBeNull();
        const rec2 = costRecord({}, pricing);
        expect(
            rec2.lines.every(
                (l) => l.tokens === "unknown" && l.cost === "unknown",
            ),
        ).toBe(true);
        expect(rec2.totalEstimated).toBeNull();
    });

    it("treats garbage cached tokens as unknown, not zero", () => {
        const rec = costRecord(
            {
                prompt_tokens: 1000,
                completion_tokens: 500,
                cached_tokens: "abc",
            },
            pricing,
        );
        expect(rec.totalEstimated).toBeNull();
    });

    it("reports cache-write tokens as informational, excluded from the total", () => {
        const rec = costRecord(
            {
                prompt_tokens: 1000,
                completion_tokens: 500,
                cache_write_tokens: 1000,
            },
            pricing,
        );
        const w = rec.lines.find(
            (l) => l.category === "promptCacheWriteTokens",
        );
        expect(w).toBeTruthy();
        expect(w.excludedFromTotal).toBe(true);
        expect(rec.totalEstimated).toBeCloseTo(
            1000 * 0.000002 + 500 * 0.00001,
            12,
        );
    });
});
