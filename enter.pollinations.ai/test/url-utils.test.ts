import { describe, expect, test } from "vitest";
import { isLoopbackUrl } from "../src/routes/url-utils.ts";

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
