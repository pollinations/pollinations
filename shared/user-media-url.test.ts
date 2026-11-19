import { describe, expect, it } from "vitest";
import { validateUserMediaUrl } from "./user-media-url.ts";

describe("validateUserMediaUrl", () => {
    it("accepts a public http(s) host", () => {
        expect(validateUserMediaUrl("https://cdn.example.com/img.png")).toMatchObject({
            ok: true,
        });
    });

    it("refuses localhost names", () => {
        expect(validateUserMediaUrl("http://localhost/secret").ok).toBe(false);
        expect(validateUserMediaUrl("http://foo.localhost/secret").ok).toBe(false);
    });

    it("refuses localhost names with trailing dots", () => {
        // DNS treats "localhost." as localhost; the host check used to miss this.
        expect(validateUserMediaUrl("http://localhost./secret")).toEqual({
            ok: false,
            reason: "private",
        });
        expect(validateUserMediaUrl("http://localhost../secret").ok).toBe(false);
        expect(validateUserMediaUrl("http://foo.localhost./secret").ok).toBe(false);
    });

    it("refuses loopback IPs including a trailing dot", () => {
        expect(validateUserMediaUrl("http://127.0.0.1/secret").ok).toBe(false);
        expect(validateUserMediaUrl("http://127.0.0.1./secret").ok).toBe(false);
    });

    it("refuses credentials in the URL", () => {
        expect(validateUserMediaUrl("https://user:pass@example.com/x")).toEqual({
            ok: false,
            reason: "private",
        });
    });

    it("refuses non-http(s) protocols", () => {
        expect(validateUserMediaUrl("file:///etc/passwd")).toEqual({
            ok: false,
            reason: "protocol",
        });
    });
});
