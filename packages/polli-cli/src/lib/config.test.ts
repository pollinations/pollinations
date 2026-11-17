import { afterEach, expect, it, vi } from "vitest";
import { resolveApiKey } from "./config.js";

afterEach(() => {
    vi.unstubAllEnvs();
});

it("uses POLLINATIONS_API_KEY unless --key is given", () => {
    vi.stubEnv("POLLINATIONS_API_KEY", "sk_env");
    expect(resolveApiKey()).toBe("sk_env");
    expect(resolveApiKey("sk_flag")).toBe("sk_flag");
});
