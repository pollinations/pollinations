import { getRealClientIp } from "@shared/client-ip.ts";
import {
    getPublicOrigin,
    hasTrustedProxyHeaders,
} from "@shared/public-origin.ts";
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

describe("proxied request client-IP resolution", () => {
    // Reproduces the pollinations-myceli-proxy hop: the Worker is invoked on the
    // public host (custom-domain route), and the proxy sets X-Forwarded-Host to
    // that same public host plus X-Original-Client-IP with the real visitor IP.
    const proxied = mockContext("https://gen.pollinations.ai/text/hi", {
        "x-forwarded-host": "gen.pollinations.ai",
        "x-forwarded-proto": "https",
        "x-original-client-ip": "46.142.212.69",
        "cf-connecting-ip": "130.176.161.10", // proxy Worker egress IP
    });

    it("trusts the proxy hop when X-Forwarded-Host is a known public host", () => {
        expect(hasTrustedProxyHeaders(proxied)).toBe(true);
    });

    it("resolves the real visitor IP, not the proxy egress IP", () => {
        expect(getRealClientIp(proxied)).toBe("46.142.212.69");
    });

    it("keeps the public-facing origin", () => {
        expect(getPublicOrigin(proxied)).toBe("https://gen.pollinations.ai");
    });

    it("does not trust an unknown forwarded host", () => {
        const spoofed = mockContext("https://gen.pollinations.ai/text/hi", {
            "x-forwarded-host": "evil.example.com",
            "x-original-client-ip": "1.2.3.4",
            "cf-connecting-ip": "130.176.161.10",
        });
        expect(hasTrustedProxyHeaders(spoofed)).toBe(false);
        // Untrusted: falls back to CF-Connecting-IP.
        expect(getRealClientIp(spoofed)).toBe("130.176.161.10");
    });

    it("uses CF-Connecting-IP for direct (non-proxied) hits", () => {
        const direct = mockContext("https://gen.myceli.ai/text/hi", {
            "cf-connecting-ip": "46.142.212.69",
        });
        expect(hasTrustedProxyHeaders(direct)).toBe(false);
        expect(getRealClientIp(direct)).toBe("46.142.212.69");
    });

    // The CloudFront pln-gen-viewer-ip function overwrites X-Original-Client-IP
    // with event.viewer.ip before the request leaves the edge, so any value a
    // client tried to spoof is gone by the time the Worker trusts the header.
    // From the Worker's perspective it simply reads the (already-overwritten)
    // value — this documents that a trusted hop's X-Original-Client-IP is
    // authoritative even though the raw header name is client-controllable.
    it("uses the CloudFront-injected client IP on a trusted hop", () => {
        const viaCloudFront = mockContext(
            "https://gen.pollinations.ai/text/hi",
            {
                "x-forwarded-host": "gen.pollinations.ai",
                "x-original-client-ip": "46.142.212.69", // injected by CloudFront fn
                "cf-connecting-ip": "64.252.67.10", // Origin Shield egress IP
            },
        );
        expect(getRealClientIp(viaCloudFront)).toBe("46.142.212.69");
    });
});
