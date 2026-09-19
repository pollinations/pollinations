import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let fetchMcpCatalog: typeof import("./catalog.js").fetchMcpCatalog;
let resolveServers: typeof import("./catalog.js").resolveServers;

const CATALOG = [
    {
        id: "pollinations",
        name: "Pollinations",
        description: "Models and media",
        url: "https://gen.pollinations.ai/mcp/pollinations",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        url: "https://gen.pollinations.ai/mcp/ffmpeg",
    },
    { id: "broken" },
];

let server: Server;
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;

beforeAll(async () => {
    server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ data: CATALOG }));
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("No test port");
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${address.port}`;
    ({ fetchMcpCatalog, resolveServers } = await import("./catalog.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchMcpCatalog", () => {
    it("returns the live servers and drops entries without a url", async () => {
        const servers = await fetchMcpCatalog();
        expect(servers.map((entry) => entry.id)).toEqual([
            "pollinations",
            "ffmpeg",
        ]);
        expect(servers[0].url).toBe(
            "https://gen.pollinations.ai/mcp/pollinations",
        );
    });
});

describe("resolveServers", () => {
    const catalog = [
        { id: "pollinations", name: "Pollinations", url: "u1" },
        { id: "exa", name: "Exa Search", url: "u2" },
    ];

    it("matches ids and display names case-insensitively", () => {
        const { servers, unknown } = resolveServers(catalog, [
            "exa",
            "POLLINATIONS",
            "exa search",
        ]);
        expect(servers.map((server) => server.id)).toEqual([
            "exa",
            "pollinations",
        ]);
        expect(unknown).toEqual([]);
    });

    it("reports unknown names without dropping the known ones", () => {
        const { servers, unknown } = resolveServers(catalog, ["nope", "exa"]);
        expect(servers.map((server) => server.id)).toEqual(["exa"]);
        expect(unknown).toEqual(["nope"]);
    });
});
