import { BASE_URL } from "../lib/config.js";

export interface CatalogServer {
    id: string;
    name: string;
    description: string;
    url: string;
}

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

export async function fetchCatalog(): Promise<CatalogServer[]> {
    try {
        const res = await fetch(`${BASE_URL}/mcp`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
            data?: Array<{
                id: string;
                name: string;
                description: string;
                url: string;
            }>;
        };
        const servers = data.data ?? [];
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
    if (!ids || ids.length === 0) return catalog;
    const set = new Set(ids.map((s) => s.toLowerCase()));
    const unknown = ids.filter(
        (id) => !catalog.some((c) => c.id.toLowerCase() === id.toLowerCase()),
    );
    if (unknown.length > 0) {
        const available = catalog.map((c) => c.id).join(", ");
        throw new Error(
            `Unknown MCP server(s): ${unknown.join(", ")}. Available: ${available}`,
        );
    }
    return catalog.filter((c) => set.has(c.id.toLowerCase()));
}
