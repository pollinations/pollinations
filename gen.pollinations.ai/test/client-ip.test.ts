import { getRealClientIp } from "@shared/client-ip.ts";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";

/**
 * Minimal Hono Context stub: getRealClientIp only reads request headers and
 * (via hasTrustedProxyHeaders) the request URL host. Headers are case-insensitive.
 */
function ctx(url: string, headers: Record<string, string>): Context {
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    return {
        req: {
            url,
            header: (name: string) => lower[name.toLowerCase()],
        },
    } as unknown as Context;
}

const TRUSTED = {
    url: "https://gen.myceli.ai/v1/chat/completions",
    xfh: "gen.pollinations.ai",
};

describe("getRealClientIp", () => {
    it("uses CloudFront-Viewer-Address (stripping :port) when trusted", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "46.142.212.69:60063",
            "cf-connecting-ip": "10.0.0.1",
        });
        expect(getRealClientIp(c)).toBe("46.142.212.69");
    });

    it("handles IPv6 CloudFront-Viewer-Address (splits on last colon)", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "2001:db8::1:54321",
        });
        expect(getRealClientIp(c)).toBe("2001:db8::1");
    });

    it("prefers CloudFront-Viewer-Address over x-original-client-ip when both present", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "203.0.113.5:1111",
            "x-original-client-ip": "198.51.100.9",
        });
        expect(getRealClientIp(c)).toBe("203.0.113.5");
    });

    it("falls back to x-original-client-ip (Cloudflare proxy path) when no CF header", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "x-original-client-ip": "198.51.100.9",
        });
        expect(getRealClientIp(c)).toBe("198.51.100.9");
    });

    it("ignores CloudFront-Viewer-Address on an UNTRUSTED host (anti-spoof)", () => {
        const c = ctx("https://gen.myceli.ai/v1/chat/completions", {
            "cloudfront-viewer-address": "9.9.9.9:1234",
            "cf-connecting-ip": "10.0.0.1",
        });
        expect(getRealClientIp(c)).toBe("10.0.0.1");
    });

    it("returns 'unknown' when nothing is present", () => {
        const c = ctx("https://gen.myceli.ai/x", {});
        expect(getRealClientIp(c)).toBe("unknown");
    });
});
