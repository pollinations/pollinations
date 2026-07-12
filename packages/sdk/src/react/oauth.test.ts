import { describe, expect, it } from "vitest";
import { consumeOAuthCallback } from "./oauth.js";

function makeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => {
            data.set(k, v);
        },
        removeItem: (k: string) => {
            data.delete(k);
        },
        snapshot: () => Object.fromEntries(data),
    };
}

const STATE_KEY = "polli:test:oauth_state";
const baseLoc = { pathname: "/", search: "", hash: "" };

describe("consumeOAuthCallback", () => {
    it("returns empty when hash is missing", () => {
        const r = consumeOAuthCallback(baseLoc, makeStorage(), STATE_KEY);
        expect(r).toEqual({
            cleanedUrl: null,
            apiKey: null,
            error: null,
            errorDescription: null,
            invalidState: false,
        });
    });

    it("returns empty when hash has no auth params", () => {
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#/route?foo=bar" },
            makeStorage(),
            STATE_KEY,
        );
        expect(r.apiKey).toBeNull();
        expect(r.cleanedUrl).toBeNull();
    });

    it("accepts api_key when state matches", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#api_key=pk_123&state=abc" },
            storage,
            STATE_KEY,
        );
        expect(r.apiKey).toBe("pk_123");
        expect(r.invalidState).toBe(false);
        expect(r.cleanedUrl).toBe("/");
        expect(storage.snapshot()).toEqual({});
    });

    it("rejects api_key when state mismatches (and preserves stored state)", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#api_key=pk_123&state=BOGUS" },
            storage,
            STATE_KEY,
        );
        expect(r.apiKey).toBeNull();
        expect(r.invalidState).toBe(true);
        expect(storage.snapshot()).toEqual({ [STATE_KEY]: "abc" });
    });

    it("rejects api_key when no state is stored (planted URL)", () => {
        const storage = makeStorage();
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#api_key=pk_123&state=anything" },
            storage,
            STATE_KEY,
        );
        expect(r.apiKey).toBeNull();
        expect(r.invalidState).toBe(true);
    });

    it("preserves hash-router route prefix on cleanup", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#/dashboard?api_key=pk_123&state=abc" },
            storage,
            STATE_KEY,
        );
        expect(r.apiKey).toBe("pk_123");
        expect(r.cleanedUrl).toBe("/#/dashboard");
    });

    it("preserves non-auth hash params on cleanup", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#api_key=pk_123&state=abc&foo=bar" },
            storage,
            STATE_KEY,
        );
        expect(r.cleanedUrl).toBe("/#foo=bar");
    });

    it("preserves pathname and search on cleanup", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            {
                pathname: "/app",
                search: "?x=1",
                hash: "#api_key=pk_123&state=abc",
            },
            storage,
            STATE_KEY,
        );
        expect(r.cleanedUrl).toBe("/app?x=1");
    });

    it("returns error and clears state when error callback state matches", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            {
                ...baseLoc,
                hash: "#error=denied&error_description=user+denied&state=abc",
            },
            storage,
            STATE_KEY,
        );
        expect(r.error).toBe("denied");
        expect(r.errorDescription).toBe("user denied");
        expect(storage.snapshot()).toEqual({});
    });

    it("returns error but preserves stored state when error state mismatches", () => {
        const storage = makeStorage({ [STATE_KEY]: "abc" });
        const r = consumeOAuthCallback(
            { ...baseLoc, hash: "#error=denied&state=BOGUS" },
            storage,
            STATE_KEY,
        );
        expect(r.error).toBe("denied");
        expect(storage.snapshot()).toEqual({ [STATE_KEY]: "abc" });
    });
});
