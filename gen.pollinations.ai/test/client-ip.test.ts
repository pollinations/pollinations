import { getRealClientIp } from "@shared/client-ip.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";

// Minimal Context stub: public-origin/client-ip only read c.req.url and headers.
function mockContext(url: string, headers: Record<string, string>): Context {
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    return {
        req: {
            url,
            header: (name: string) => lower[name.toLowerCase()],
        },
    } as unknown as Context;
}

describe("client IP and public origin", () => {
    // No edge hop sits in front of the Workers, so forwarding headers can
    // only come from the caller (#17462).
    it("ignores client-sent forwarding headers", () => {
        const spoofed = mockContext("https://staging.gen.pollinations.ai/x", {
            "x-forwarded-host": "gen.pollinations.ai",
            "x-original-client-ip": "9.9.9.9",
            "cf-connecting-ip": "203.0.113.42",
        });
        expect(getRealClientIp(spoofed)).toBe("203.0.113.42");
        expect(getPublicOrigin(spoofed)).toBe(
            "https://staging.gen.pollinations.ai",
        );
    });

    it("returns unknown without CF-Connecting-IP", () => {
        const local = mockContext("http://localhost:8788/x", {});
        expect(getRealClientIp(local)).toBe("unknown");
    });
});
