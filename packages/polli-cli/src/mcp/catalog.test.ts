import { afterEach, expect, it, vi } from "vitest";
import { BASE_URL } from "../lib/config.js";
import { fetchMcpCatalog, ownedServerId, serverUrl } from "./catalog.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => mockFetch.mockReset());

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

it("derives the hosted URL from a server id", () => {
    expect(serverUrl("pollinations")).toBe(`${BASE_URL}/mcp/pollinations`);
});

it.each([
    [serverUrl("ffmpeg"), "ffmpeg"],
    [`${serverUrl("exa")}/`, "exa"],
    ["https://example.com/mcp/pollinations", null],
    [`${BASE_URL}/v1/models`, null],
    [`${BASE_URL}/mcp/`, null],
    ["gen.pollinations.ai/mcp/pollinations", null],
    [undefined, null],
    [42, null],
])("recognises %s as %s", (value, expected) => {
    expect(ownedServerId(value)).toBe(expected);
});

it("reads the live catalog and skips unusable entries", async () => {
    mockFetch.mockResolvedValue(
        jsonResponse({
            data: [
                {
                    id: "pollinations",
                    name: "Pollinations",
                    description: "text, media, embeddings",
                    url: serverUrl("pollinations"),
                    pricing: 0.01,
                },
                { id: "ffmpeg", url: serverUrl("ffmpeg") },
                { id: "foreign", url: "https://example.com/mcp/foreign" },
                { name: "no id" },
                "junk",
            ],
        }),
    );

    expect(await fetchMcpCatalog()).toEqual([
        {
            id: "pollinations",
            name: "Pollinations",
            description: "text, media, embeddings",
            url: serverUrl("pollinations"),
        },
        {
            id: "ffmpeg",
            name: "ffmpeg",
            description: "",
            url: serverUrl("ffmpeg"),
        },
        {
            id: "foreign",
            name: "foreign",
            description: "",
            url: serverUrl("foreign"),
        },
    ]);
});

it("drops catalog ids that a shell could interpret", async () => {
    mockFetch.mockResolvedValue(
        jsonResponse({
            data: [
                { id: "ok-1", url: serverUrl("ok-1") },
                { id: "evil&calc", url: serverUrl("evil&calc") },
                { id: "semi;colon" },
                { id: "../escape" },
                { id: "-leading" },
            ],
        }),
    );

    expect(await fetchMcpCatalog()).toEqual([
        {
            id: "ok-1",
            name: "ok-1",
            description: "",
            url: serverUrl("ok-1"),
        },
    ]);
});

it("fails loudly when the catalog is unavailable", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "down" }, 500));
    await expect(fetchMcpCatalog()).rejects.toThrow("500");
});

it("treats a missing catalog list as empty", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    expect(await fetchMcpCatalog()).toEqual([]);
});
