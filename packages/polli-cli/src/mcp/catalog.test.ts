import { describe, expect, it } from "vitest";
import { type McpServer, resolveServers } from "./catalog.js";

const CATALOG: McpServer[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        url: "https://gen.pollinations.ai/mcp/pollinations",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        url: "https://gen.pollinations.ai/mcp/ffmpeg",
    },
];

describe("resolveServers", () => {
    it("returns the full catalog when no ids are requested", () => {
        expect(resolveServers(CATALOG, undefined)).toEqual(CATALOG);
        expect(resolveServers(CATALOG, [])).toEqual(CATALOG);
    });

    it("resolves requested ids by id in order", () => {
        expect(resolveServers(CATALOG, ["ffmpeg", "pollinations"])).toEqual([
            CATALOG[1],
            CATALOG[0],
        ]);
    });

    it("resolves by display name as well as id", () => {
        expect(resolveServers(CATALOG, ["FFmpeg"])).toEqual([CATALOG[1]]);
    });

    it("throws a helpful error for an unknown server", () => {
        expect(() => resolveServers(CATALOG, ["nope"])).toThrow(
            'Unknown MCP server "nope". Available servers: pollinations, ffmpeg',
        );
    });
});
