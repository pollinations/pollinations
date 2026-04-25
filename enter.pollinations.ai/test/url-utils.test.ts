import { describe, expect, test } from "vitest";
import {
    appUrlMatchesRedirect,
    isLoopbackUrl,
} from "../src/routes/url-utils.ts";

describe("isLoopbackUrl", () => {
    test("detects local development hostnames", () => {
        expect(isLoopbackUrl("http://localhost:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://localhost.:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://127.0.0.1:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://127.10.20.30:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://[::1]:3000/callback")).toBe(true);
    });

    test("does not treat non-loopback hostnames as local", () => {
        expect(isLoopbackUrl("https://example.com/callback")).toBe(false);
        expect(isLoopbackUrl("https://local.host/callback")).toBe(false);
    });
});

describe("appUrlMatchesRedirect", () => {
    test("matches the exact normalized URL", () => {
        expect(
            appUrlMatchesRedirect(
                "https://Example.com",
                "https://example.com/",
            ),
        ).toBe(true);
        expect(
            appUrlMatchesRedirect(
                "https://example.com:443/callback",
                "https://example.com/callback",
            ),
        ).toBe(true);
    });

    test("does not match partial URL prefixes", () => {
        expect(
            appUrlMatchesRedirect("http://local", "http://localhost:3456/"),
        ).toBe(false);
        expect(
            appUrlMatchesRedirect(
                "https://example.com",
                "https://example.com/callback",
            ),
        ).toBe(false);
        expect(
            appUrlMatchesRedirect(
                "https://example.com/callback",
                "https://example.com/callback/extra",
            ),
        ).toBe(false);
    });

    test("requires query strings to match", () => {
        expect(
            appUrlMatchesRedirect(
                "https://example.com/callback?app=one",
                "https://example.com/callback?app=one",
            ),
        ).toBe(true);
        expect(
            appUrlMatchesRedirect(
                "https://example.com/callback?app=one",
                "https://example.com/callback?app=two",
            ),
        ).toBe(false);
    });
});
