import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let fetchMcpCatalog: typeof import("./catalog.js").fetchMcpCatalog;
let resolveServers: typeof import("./catalog.js").resolveServers;

let server: Server;
let baseUrl: string;
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;

beforeAll(async () => {
    server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
            JSON.stringify({
                data: [
                    {
                        id: "pollinations",
                        name: "Pollinations",
                        description: "Generate media",
                        url: `${baseUrl}/mcp/pollinations`,
                    },
                    {
                        id: "ffmpeg",
                        name: "FFmpeg",
                        url: `${baseUrl}/mcp/ffmpeg`,
                    },
                    { id: "broken", name: "Broken" },
                ],
            }),
        );
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("no test server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
    process.env.POLLINATIONS_BASE_URL = baseUrl;
    ({ fetchMcpCatalog, resolveServers } = await import("./catalog.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    await new Promise((resolve) => server.close(resolve));
});

describe("fetchMcpCatalog", () => {
    it("returns servers with id and url, dropping incomplete entries", async () => {
        const catalog = await fetchMcpCatalog();
        expect(catalog.map((entry) => entry.id)).toEqual([
            "pollinations",
            "ffmpeg",
        ]);
        expect(catalog[0].url).toBe(`${baseUrl}/mcp/pollinations`);
    });
});

describe("resolveServers", () => {
    const catalog = [
        { id: "pollinations", name: "Pollinations", url: "u1" },
        { id: "ffmpeg", name: "FFmpeg", url: "u2" },
    ];

    it("returns the whole catalog when nothing was requested", () => {
        expect(resolveServers(catalog, undefined)).toEqual(catalog);
        expect(resolveServers(catalog, [])).toEqual(catalog);
    });

    it("resolves requested ids", () => {
        expect(resolveServers(catalog, ["ffmpeg"])).toEqual([catalog[1]]);
    });

    it("rejects unknown ids and lists what exists", () => {
        expect(() => resolveServers(catalog, ["nope"])).toThrow(
            /Unknown MCP server "nope".*pollinations, ffmpeg/,
        );
    });
});
