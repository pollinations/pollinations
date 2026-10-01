import { describe, expect, it } from "vitest";
import { consumeOAuthCallback } from "./oauth.js";

function makeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        removeItem: (key: string) => data.delete(key),
        snapshot: () => Object.fromEntries(data),
    };
}

const STATE_KEY = "polli:test:oauth_state";
const baseLocation = { pathname: "/", search: "", hash: "" };

describe("consumeOAuthCallback", () => {
    it("returns empty without OAuth query parameters", () => {
        expect(
            consumeOAuthCallback(baseLocation, makeStorage(), STATE_KEY),
        ).toEqual({
            cleanedUrl: null,
            code: null,
            error: null,
            errorDescription: null,
            invalidState: false,
        });
    });

    it("accepts an authorization code when state matches", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const result = consumeOAuthCallback(
            { ...baseLocation, search: "?code=single-use&state=abc" },
            storage,
            STATE_KEY,
        );

        expect(result.code).toBe("single-use");
        expect(result.invalidState).toBe(false);
        expect(result.cleanedUrl).toBe("/");
        expect(storage.snapshot()).toEqual({});
    });

    it("rejects a callback with mismatched state without clearing it", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const result = consumeOAuthCallback(
            { ...baseLocation, search: "?code=single-use&state=wrong" },
            storage,
            STATE_KEY,
        );

        expect(result.code).toBeNull();
        expect(result.invalidState).toBe(true);
        expect(storage.snapshot()).toEqual({ [STATE_KEY]: "abc" });
    });

    it("preserves unrelated query parameters and hash routes", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const result = consumeOAuthCallback(
            {
                pathname: "/callback",
                search: "?view=models&code=single-use&state=abc",
                hash: "#/details",
            },
            storage,
            STATE_KEY,
        );

        expect(result.cleanedUrl).toBe("/callback?view=models#/details");
    });

    it("returns a valid OAuth error and clears matched state", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const result = consumeOAuthCallback(
            {
                ...baseLocation,
                search: "?error=access_denied&error_description=user+denied&state=abc",
            },
            storage,
            STATE_KEY,
        );

        expect(result.error).toBe("access_denied");
        expect(result.errorDescription).toBe("user denied");
        expect(result.cleanedUrl).toBe("/");
        expect(storage.snapshot()).toEqual({});
    });
});
