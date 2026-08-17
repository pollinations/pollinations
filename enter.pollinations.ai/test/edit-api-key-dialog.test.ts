import {
    isPublishableKey,
    shouldPostKeyMetadata,
} from "@frontend/components/keys/key-type.ts";
import type { ApiKey } from "@frontend/components/keys/types.ts";
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
