import { describe, expect, it } from "vitest";
import { canonicalizeTopUpReturnUrl, consumeTopUpReturn } from "./top-up.js";

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        snapshot: () => Object.fromEntries(values),
    };
}

const STATE_KEY = "polli:pk_test:topup_state";

describe("top-up return handling", () => {
    it("canonicalizes the requested return URL", () => {
        expect(
            canonicalizeTopUpReturnUrl(
                "https://app.example/path?view=grid&topup=success&topup_state=old#editor",
            ),
        ).toBe("https://app.example/path?view=grid");
    });

    it("accepts and consumes a matching success return", () => {
        const storage = memoryStorage({ [STATE_KEY]: "expected" });
        const result = consumeTopUpReturn(
            {
                href: "https://app.example/path?view=grid&topup=success&topup_state=expected#editor",
            },
            storage,
            STATE_KEY,
        );

        expect(result).toEqual({
            cleanedUrl: "/path?view=grid#editor",
            status: "success",
            invalidState: false,
        });
        expect(storage.snapshot()).toEqual({});
    });

    it("strips but ignores a forged return without consuming pending state", () => {
        const storage = memoryStorage({ [STATE_KEY]: "expected" });
        const result = consumeTopUpReturn(
            {
                href: "https://app.example/?topup=success&topup_state=forged",
            },
            storage,
            STATE_KEY,
        );

        expect(result).toEqual({
            cleanedUrl: "/",
            status: null,
            invalidState: true,
        });
        expect(storage.snapshot()).toEqual({ [STATE_KEY]: "expected" });
    });

    it("ignores a replay after the nonce was consumed", () => {
        const result = consumeTopUpReturn(
            {
                href: "https://app.example/?topup=canceled&topup_state=old",
            },
            memoryStorage(),
            STATE_KEY,
        );

        expect(result.status).toBeNull();
        expect(result.invalidState).toBe(true);
        expect(result.cleanedUrl).toBe("/");
    });
});
