import { describe, expect, it } from "vitest";
import { lookupUpstream } from "./upstream";

const PROD_MAP = JSON.stringify({
    "pollinations.ai": "pollinations.myceli.ai",
    "enter.pollinations.ai": "enter.myceli.ai",
    "gen.pollinations.ai": "gen.myceli.ai",
    "media.pollinations.ai": "media.myceli.ai",
});

const STAGING_MAP = JSON.stringify({
    "staging.pollinations.ai": "staging.pollinations.myceli.ai",
    "staging.enter.pollinations.ai": "staging.enter.myceli.ai",
    "staging.gen.pollinations.ai": "staging.gen.myceli.ai",
});

describe("lookupUpstream", () => {
    it("maps the apex via the explicit map", () => {
        expect(lookupUpstream(PROD_MAP, "pollinations.ai")).toBe(
            "pollinations.myceli.ai",
        );
    });

    it("maps core services via the explicit map", () => {
        expect(lookupUpstream(PROD_MAP, "enter.pollinations.ai")).toBe(
            "enter.myceli.ai",
        );
    });

    it("maps an app subdomain via the generic rule", () => {
        expect(lookupUpstream(PROD_MAP, "catgpt.pollinations.ai")).toBe(
            "catgpt.myceli.ai",
        );
    });

    it("maps hyphenated app subdomains", () => {
        expect(
            lookupUpstream(PROD_MAP, "ai-dungeon-master.pollinations.ai"),
        ).toBe("ai-dungeon-master.myceli.ai");
    });

    it("returns undefined for non-pollinations hosts", () => {
        expect(lookupUpstream(PROD_MAP, "example.com")).toBeUndefined();
    });

    it("does not generic-match multi-label hosts", () => {
        expect(
            lookupUpstream(PROD_MAP, "staging.enter.pollinations.ai"),
        ).toBeUndefined();
    });

    it("explicit map wins over the generic rule", () => {
        expect(lookupUpstream(STAGING_MAP, "staging.pollinations.ai")).toBe(
            "staging.pollinations.myceli.ai",
        );
    });

    it("still resolves when the map JSON is malformed", () => {
        expect(lookupUpstream("not json", "catgpt.pollinations.ai")).toBe(
            "catgpt.myceli.ai",
        );
    });
});
