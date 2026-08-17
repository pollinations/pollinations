import {
    isAppKey,
    isPublishableKey,
    readRedirectUris,
    shouldPostKeyMetadata,
} from "@frontend/components/keys/key-type.ts";
import type { ApiKey } from "@frontend/components/keys/types.ts";
import { getRedirectUris } from "@shared/auth/api-key-metadata.ts";
import { describe, expect, it } from "vitest";

function makeKey(metadata: Record<string, unknown> | null): ApiKey {
    return {
        id: "key_1",
        createdAt: new Date().toISOString(),
        permissions: null,
        metadata,
    };
}

// The edit dialog renders the redirect-URI / earnings fields when
// isPublishableKey is true, so anything it renders must also pass
// shouldPostKeyMetadata or the save silently drops the edit.
describe("publishable key settings gate", () => {
    it("renders and saves for a publishable key with no redirect URIs or earnings", () => {
        const key = makeKey({ keyType: "publishable" });
        expect(isPublishableKey(key)).toBe(true);
        expect(
            shouldPostKeyMetadata(key, {
                redirectUris: ["https://myapp.com/callback"],
                earningsEnabled: false,
            }),
        ).toBe(true);
    });

    it("renders and saves for a publishable key that is also an app key", () => {
        const key = makeKey({
            keyType: "publishable",
            redirectUris: ["https://myapp.com/callback"],
        });
        expect(isPublishableKey(key)).toBe(true);
        expect(
            shouldPostKeyMetadata(key, {
                redirectUris: ["https://myapp.com/other"],
                earningsEnabled: false,
            }),
        ).toBe(true);
    });

    it("neither renders nor saves for a secret key", () => {
        const key = makeKey({ keyType: "secret" });
        expect(isPublishableKey(key)).toBe(false);
        expect(
            shouldPostKeyMetadata(key, {
                redirectUris: ["https://myapp.com/callback"],
                earningsEnabled: true,
            }),
        ).toBe(false);
    });

    it("neither renders nor saves for a key with no metadata", () => {
        const key = makeKey(null);
        expect(isPublishableKey(key)).toBe(false);
    });
});

describe("shouldPostKeyMetadata", () => {
    const plainPublishable = makeKey({ keyType: "publishable" });

    it("posts enabled earnings on a publishable non-app key", () => {
        expect(
            shouldPostKeyMetadata(plainPublishable, {
                redirectUris: [],
                earningsEnabled: true,
            }),
        ).toBe(true);
    });

    it("skips the post when nothing changed", () => {
        expect(
            shouldPostKeyMetadata(plainPublishable, {
                redirectUris: [],
                earningsEnabled: false,
            }),
        ).toBe(false);
    });
});

// The key list groups cards with isAppKey and the edit dialog titles and gates
// itself with the same predicate. They used to be two copies that disagreed on
// whitespace-only URIs, so a key could sit under "API keys" while its dialog
// called it an app key. One shared predicate is the fix; these pin it.
describe("one shared predicate for list grouping and dialog gating", () => {
    it("treats a whitespace-only redirect URI the same way everywhere", () => {
        const key = makeKey({ keyType: "publishable", redirectUris: ["  "] });
        expect(readRedirectUris(key.metadata)).toEqual(["  "]);
        expect(isAppKey(key)).toBe(true);
    });

    it("agrees with the server's redirect-URI reader", () => {
        for (const metadata of [
            { redirectUris: ["https://a.example/cb"] },
            { redirectUris: ["https://a.example/cb", "", null, 1] },
            { redirectUris: ["  "] },
            { redirectUris: "not-an-array" },
            {},
        ]) {
            expect(readRedirectUris(metadata)).toEqual(
                getRedirectUris(metadata),
            );
        }
    });

    it("drops non-string redirect URIs before they reach a card", () => {
        const key = makeKey({
            keyType: "publishable",
            redirectUris: ["https://a.example/cb", null, 1, ""],
        });
        expect(readRedirectUris(key.metadata)).toEqual([
            "https://a.example/cb",
        ]);
    });

    it("counts an earnings-only key as an app key with no redirect URIs", () => {
        const key = makeKey({ keyType: "publishable", earningsEnabled: true });
        expect(readRedirectUris(key.metadata)).toEqual([]);
        expect(isAppKey(key)).toBe(true);
    });

    it("never treats a secret key as an app key", () => {
        const key = makeKey({
            keyType: "secret",
            redirectUris: ["https://a.example/cb"],
            earningsEnabled: true,
        });
        expect(isPublishableKey(key)).toBe(false);
        expect(isAppKey(key)).toBe(false);
    });
});
