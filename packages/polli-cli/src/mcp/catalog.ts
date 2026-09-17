import { BASE_URL } from "../lib/config.js";

export type CatalogServer = {
    id: string;
    name: string;
    description: string;
    url: string;
};

const FALLBACK: CatalogServer[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        description: "Access Pollinations models and API capabilities",
        url: `${BASE_URL}/mcp/pollinations`,
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description:
            "Trim, convert, resize, compress, and remix audio and video",
        url: `${BASE_URL}/mcp/ffmpeg`,
    },
    {
        id: "exa",
        name: "Exa Search",
        description: "Search the live web and fetch clean content",
        url: `${BASE_URL}/mcp/exa`,
    },
    {
        id: "composio",
        name: "Composio",
        description:
            "Use Gmail, Slack, GitHub, Drive, and hundreds of other apps",
        url: `${BASE_URL}/mcp/composio`,
    },
    {
        id: "computer",
        name: "Computer",
        description: "A private persistent computer: files and a bash shell",
        url: `${BASE_URL}/mcp/computer`,
    },
];

export async function fetchCatalog(
    fetchImpl: typeof fetch = fetch,
): Promise<CatalogServer[]> {
    try {
        const res = await fetchImpl(`${BASE_URL}/mcp`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
            data?: Array<{
                id: string;
                name: string;
                description: string;
                url: string;
            }>;
        };
        const servers = body.data ?? [];
        if (servers.length === 0) throw new Error("empty catalog");
        return servers.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            url: s.url,
        }));
    } catch {
        return FALLBACK;
    }
}

export function filterServers(
    catalog: CatalogServer[],
    ids: string[],
): CatalogServer[] {
    if (ids.length === 0) return catalog;
    const wanted = new Set(ids.map((id) => id.toLowerCase()));
    const unknown = ids.filter(
        (id) => !catalog.some((s) => s.id.toLowerCase() === id.toLowerCase()),
    );
    if (unknown.length > 0) {
        throw new Error(
            `Unknown MCP server(s): ${unknown.join(", ")}. Available: ${catalog.map((s) => s.id).join(", ")}`,
        );
    }
    return catalog.filter((s) => wanted.has(s.id.toLowerCase()));
}
