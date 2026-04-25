import { describe, expect, test } from "vitest";
import {
    appUrlMatchesRedirect,
    isLoopbackUrl,
} from "../src/routes/url-utils.ts";

describe("url-utils", () => {
    test("handles loopback and exact app URL matching", () => {
        expect(isLoopbackUrl("http://localhost:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://localhost.:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://127.0.0.1:3000/callback")).toBe(true);
        expect(isLoopbackUrl("http://[::1]:3000/callback")).toBe(true);
        expect(isLoopbackUrl("https://example.com/callback")).toBe(false);

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
        expect(
            appUrlMatchesRedirect("http://local", "http://localhost:3456/"),
        ).toBe(false);
        expect(
            appUrlMatchesRedirect(
                "https://example.com",
                "https://example.com/callback",
            ),
        ).toBe(false);
    });
});
