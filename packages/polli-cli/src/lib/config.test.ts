import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApiKey, setKeyOverride } from "./config.js";

describe("resolveApiKey", () => {
    const originalEnv = process.env.POLLINATIONS_API_KEY;

    beforeEach(() => {
        setKeyOverride(undefined);
        delete process.env.POLLINATIONS_API_KEY;
    });

    afterEach(() => {
        setKeyOverride(undefined);
        if (originalEnv !== undefined) {
            process.env.POLLINATIONS_API_KEY = originalEnv;
        } else {
            delete process.env.POLLINATIONS_API_KEY;
        }
        vi.restoreAllMocks();
    });

    it("prefers explicit flagKey over override, env, and stored config", () => {
        setKeyOverride("sk_override");
        process.env.POLLINATIONS_API_KEY = "sk_env";
        expect(resolveApiKey("sk_flag")).toBe("sk_flag");
    });

    it("prefers key override over env and stored config", () => {
        setKeyOverride("sk_override");
        process.env.POLLINATIONS_API_KEY = "sk_env";
        expect(resolveApiKey()).toBe("sk_override");
    });

    it("uses POLLINATIONS_API_KEY when no flag or override is provided", () => {
        process.env.POLLINATIONS_API_KEY = "sk_env_key";
        expect(resolveApiKey()).toBe("sk_env_key");
    });

    it("trims POLLINATIONS_API_KEY and ignores empty or whitespace-only values", () => {
        process.env.POLLINATIONS_API_KEY = "  sk_trimmed  ";
        expect(resolveApiKey()).toBe("sk_trimmed");

        process.env.POLLINATIONS_API_KEY = "   ";
        // Should fall back (either undefined or whatever stored config has, but not whitespace)
        expect(resolveApiKey()).not.toBe("   ");
    });
});
