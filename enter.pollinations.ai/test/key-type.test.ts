import {
    getKeyAccessContext,
    isAppKey,
    isPublishableKey,
    readRedirectUris,
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

describe("standalone key access context", () => {
    it("keeps ordinary secrets and publisher app keys in the key editor", () => {
        expect(getKeyAccessContext(makeKey(null))).toBeUndefined();
        expect(
            getKeyAccessContext(makeKey({ keyType: "secret" })),
        ).toBeUndefined();
        expect(
            getKeyAccessContext(
                makeKey({
                    keyType: "publishable",
                    redirectUris: ["https://app.example/cb"],
                }),
            ),
        ).toBeUndefined();
    });

    it("recognizes registered and legacy app grants", () => {
        expect(
            getKeyAccessContext({
                ...makeKey(null),
                byopClientKeyId: "app-id",
            }),
        ).toBe("app");
        expect(
            getKeyAccessContext(
                makeKey({ redirectOrigin: "https://app.example" }),
            ),
        ).toBe("app");
    });

    it("uses device wording even when the device belongs to an app", () => {
        const key = makeKey({ deviceUserCode: "test-code" });
        expect(getKeyAccessContext(key)).toBe("device");
        expect(getKeyAccessContext({ ...key, byopClientKeyId: "app-id" })).toBe(
            "device",
        );
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
