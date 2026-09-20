import { describe, expect, it } from "vitest";
import { resolveServers } from "./catalog.js";

const catalog = [
    { id: "pollinations", name: "Pollinations", url: "u1" },
    { id: "ffmpeg", name: "FFmpeg", url: "u2" },
];

describe("resolveServers", () => {
    it("returns the whole catalog when nothing was requested", () => {
        expect(resolveServers(catalog, undefined)).toEqual(catalog);
        expect(resolveServers(catalog, [])).toEqual(catalog);
    });

    it("resolves requested ids and names", () => {
        expect(resolveServers(catalog, ["ffmpeg"])).toEqual([catalog[1]]);
        expect(resolveServers(catalog, ["Pollinations"])).toEqual([catalog[0]]);
    });

    it("rejects unknown ids and lists what exists", () => {
        expect(() => resolveServers(catalog, ["nope"])).toThrow(
            /Unknown MCP server "nope".*pollinations, ffmpeg/,
        );
    });
});
