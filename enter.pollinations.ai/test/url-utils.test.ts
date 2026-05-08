import { describe, expect, test } from "vitest";
import {
    isLoopbackUrl,
    redirectUriMatchesAllowlist,
} from "../src/routes/url-utils.ts";

describe("isLoopbackUrl", () => {
    test("recognizes loopback hostnames", () => {
        expect(isLoopbackUrl("http://localhost:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://localhost.:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://127.0.0.1:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://[::1]:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://0.0.0.0:3000/callback")).toBe(true);
        expect(isLoopbackUrl("https://example.com/callback")).toBe(false);
        expect(isLoopbackUrl("not a url")).toBe(false);
    });
});

describe("redirectUriMatchesAllowlist", () => {
    test("returns false when allowlist is empty or missing", () => {
        expect(redirectUriMatchesAllowlist("https://app.com/cb", [])).toBe(
            false,
        );
        expect(redirectUriMatchesAllowlist("https://app.com/cb", null)).toBe(
            false,
        );
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb", undefined),
        ).toBe(false);
    });

    test("matches identical scheme + host + port + path", () => {
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb", [
                "https://app.com/cb",
            ]),
        ).toBe(true);
    });

    test("ignores query strings (host + path is what's pinned)", () => {
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb?flow=byop", [
                "https://app.com/cb",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist(
                "https://app.com/cb?prompt=hi&model=x",
                ["https://app.com/cb"],
            ),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb", [
                "https://app.com/cb?env=prod",
            ]),
        ).toBe(true);
    });

    test("treats trailing slash on path as insignificant", () => {
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb/", [
                "https://app.com/cb",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb", [
                "https://app.com/cb/",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("https://app.com/", [
                "https://app.com",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb/x", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
    });

    test("rejects fragments on either side", () => {
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb#token", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
        expect(
            redirectUriMatchesAllowlist("https://app.com/cb", [
                "https://app.com/cb#frag",
            ]),
        ).toBe(false);
    });

    test("rejects different host (the confused-deputy attack)", () => {
        // attacker uses victim's client_id + their own redirect
        expect(
            redirectUriMatchesAllowlist("https://attacker.com/steal", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
    });

    test("rejects different scheme, port, or path", () => {
        expect(
            redirectUriMatchesAllowlist("http://app.com/cb", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
        expect(
            redirectUriMatchesAllowlist("https://app.com:8443/cb", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
        expect(
            redirectUriMatchesAllowlist("https://app.com/other", [
                "https://app.com/cb",
            ]),
        ).toBe(false);
    });

    test("accepts any port for loopback entries (RFC 8252 §7.3)", () => {
        expect(
            redirectUriMatchesAllowlist("http://127.0.0.1:54321/cb", [
                "http://127.0.0.1/cb",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("http://localhost:9999/cb", [
                "http://localhost:3000/cb",
            ]),
        ).toBe(true);
        expect(
            redirectUriMatchesAllowlist("http://[::1]:7777/cb", [
                "http://[::1]:3000/cb",
            ]),
        ).toBe(true);
    });

    test("loopback port-agnostic match still requires path", () => {
        expect(
            redirectUriMatchesAllowlist("http://localhost:3000/other", [
                "http://localhost:3000/cb",
            ]),
        ).toBe(false);
    });

    test("matches when any allowlist entry matches", () => {
        expect(
            redirectUriMatchesAllowlist("https://staging.app.com/cb", [
                "https://app.com/cb",
                "https://staging.app.com/cb",
            ]),
        ).toBe(true);
    });

    test("returns false for malformed incoming uri", () => {
        expect(
            redirectUriMatchesAllowlist("not a url", ["https://app.com/cb"]),
        ).toBe(false);
    });
});
