import { describe, expect, it } from "vitest";
import { siblingOrigin } from "./public-origin";

describe("siblingOrigin (gen <-> enter host mapping)", () => {
    it("maps production hosts to their sibling in both directions", () => {
        expect(siblingOrigin("https://gen.pollinations.ai", "enter")).toBe(
            "https://enter.pollinations.ai",
        );
        expect(siblingOrigin("https://enter.pollinations.ai", "gen")).toBe(
            "https://gen.pollinations.ai",
        );
    });

    it("keeps staging and dev on their own tier, in both directions", () => {
        expect(siblingOrigin("https://staging.gen.pollinations.ai", "enter")).toBe(
            "https://staging.enter.pollinations.ai",
        );
        expect(siblingOrigin("https://staging.enter.pollinations.ai", "gen")).toBe(
            "https://staging.gen.pollinations.ai",
        );
        expect(siblingOrigin("https://dev.gen.pollinations.ai", "enter")).toBe(
            "https://dev.enter.pollinations.ai",
        );
        expect(siblingOrigin("https://dev.enter.pollinations.ai", "gen")).toBe(
            "https://dev.gen.pollinations.ai",
        );
    });

    it("falls back to production with the port cleared for local and preview hosts", () => {
        expect(siblingOrigin("http://127.0.0.1:8788", "enter")).toBe(
            "https://enter.pollinations.ai",
        );
        expect(siblingOrigin("http://localhost:8788", "gen")).toBe(
            "https://gen.pollinations.ai",
        );
        expect(siblingOrigin("https://preview-42.f8vni13.cloudflare.dev", "enter")).toBe(
            "https://enter.pollinations.ai",
        );
        expect(siblingOrigin("https://preview-42.f8vni13.cloudflare.dev", "gen")).toBe(
            "https://gen.pollinations.ai",
        );
    });
});
