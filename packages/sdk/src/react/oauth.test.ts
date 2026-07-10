import { describe, expect, it } from "vitest";
import { consumeOAuthCallback } from "./oauth.js";

function makeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
        snapshot: () => Object.fromEntries(data),
    };
}

const PENDING_KEY = "polli:test:oauth_pending";
const pending = JSON.stringify({
    state: "abc",
    codeVerifier: "verifier",
    redirectUri: "https://app.example/callback?keep=1",
});
const baseLocation = { pathname: "/callback", search: "", hash: "#route" };

describe("consumeOAuthCallback", () => {
    it("returns empty when query has no OAuth response", () => {
        const result = consumeOAuthCallback(
            { ...baseLocation, search: "?keep=1" },
            makeStorage(),
            PENDING_KEY,
        );
        expect(result).toEqual({
            cleanedUrl: null,
            code: null,
            codeVerifier: null,
            redirectUri: null,
            error: null,
            errorDescription: null,
            invalidState: false,
        });
    });

    it("accepts a code when state matches and returns the PKCE exchange data", () => {
        const storage = makeStorage({ [PENDING_KEY]: pending });
        const result = consumeOAuthCallback(
            {
                ...baseLocation,
                search: "?keep=1&code=oauth-code&state=abc",
            },
            storage,
            PENDING_KEY,
        );

        expect(result.code).toBe("oauth-code");
        expect(result.codeVerifier).toBe("verifier");
        expect(result.redirectUri).toBe("https://app.example/callback?keep=1");
        expect(result.cleanedUrl).toBe("/callback?keep=1#route");
        expect(storage.snapshot()).toEqual({ [PENDING_KEY]: pending });
    });

    it("rejects a code when state mismatches and preserves pending state", () => {
        const storage = makeStorage({ [PENDING_KEY]: pending });
        const result = consumeOAuthCallback(
            { ...baseLocation, search: "?code=oauth-code&state=wrong" },
            storage,
            PENDING_KEY,
        );

        expect(result.code).toBeNull();
        expect(result.invalidState).toBe(true);
        expect(storage.snapshot()).toEqual({ [PENDING_KEY]: pending });
    });

    it("rejects a planted code when no authorization is pending", () => {
        const result = consumeOAuthCallback(
            { ...baseLocation, search: "?code=oauth-code&state=abc" },
            makeStorage(),
            PENDING_KEY,
        );
        expect(result.invalidState).toBe(true);
    });

    it("returns an error and clears matching pending state", () => {
        const storage = makeStorage({ [PENDING_KEY]: pending });
        const result = consumeOAuthCallback(
            {
                ...baseLocation,
                search: "?error=access_denied&error_description=user+denied&state=abc",
            },
            storage,
            PENDING_KEY,
        );

        expect(result.error).toBe("access_denied");
        expect(result.errorDescription).toBe("user denied");
        expect(result.cleanedUrl).toBe("/callback#route");
        expect(storage.snapshot()).toEqual({});
    });

    it("rejects an error when state mismatches and preserves pending state", () => {
        const storage = makeStorage({ [PENDING_KEY]: pending });
        const result = consumeOAuthCallback(
            {
                ...baseLocation,
                search: "?error=access_denied&state=wrong",
            },
            storage,
            PENDING_KEY,
        );

        expect(result.error).toBeNull();
        expect(result.invalidState).toBe(true);
        expect(storage.snapshot()).toEqual({ [PENDING_KEY]: pending });
    });
});
