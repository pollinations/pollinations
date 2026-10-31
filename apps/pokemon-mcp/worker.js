import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const API = "https://pokeapi.co/api/v2";

async function fetchPokemon(name, fetchImpl = fetch) {
    const url = `${API}/pokemon/${encodeURIComponent(name.toLowerCase().trim())}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
        throw new Error(`Pokémon not found or API error: HTTP ${res.status}`);
    }
    return res.json();
}

function summarize(p) {
    return {
        name: p.name,
        id: p.id,
        base_experience: p.base_experience,
        height: `${p.height}`,
        weight: `${p.weight}`,
        types: (p.types ?? []).map((t) => t.type.name),
        abilities: (p.abilities ?? []).map((a) => a.ability.name),
        base_stats: Object.fromEntries(
            (p.stats ?? []).map((s) => [s.stat.name, s.base_stat]),
        ),
        sprite: p.sprites?.front_default ?? null,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "pokemon-mcp", title: "PokéAPI MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "pokemon_lookup",
        {
            description:
                "Look up information about a Pokémon by name or Pokédex number: types, " +
                "abilities, height, weight, base experience, and base stats. Uses the free PokéAPI.",
            inputSchema: z.object({
                name: z
                    .string()
                    .min(1)
                    .describe("Pokémon name (e.g. pikachu, charizard) or id"),
            }),
        },
        async ({ name }) => {
            try {
                const p = await fetchPokemon(name);
                return createMCPResponse([
                    createTextContent(summarize(p), true),
                ]);
            } catch (error) {
                return createMCPResponse([
                    createTextContent(
                        {
                            error: error.message,
                            hint: "Check the name or Pokédex id",
                        },
                        true,
                    ),
                ]);
            }
        },
    );

    server.registerTool(
        "pokemon_compare",
        {
            description:
                "Compare two Pokémon: types, height, weight, and total base stats, with a quick " +
                "summary of which one is taller, heavier, and stronger overall.",
            inputSchema: z.object({
                first: z.string().min(1).describe("First Pokémon name or id"),
                second: z.string().min(1).describe("Second Pokémon name or id"),
            }),
        },
        async ({ first, second }) => {
            try {
                const [a, b] = await Promise.all([
                    fetchPokemon(first),
                    fetchPokemon(second),
                ]);
                const sa = summarize(a);
                const sb = summarize(b);
                const totalA = Object.values(sa.base_stats).reduce(
                    (n, v) => n + v,
                    0,
                );
                const totalB = Object.values(sb.base_stats).reduce(
                    (n, v) => n + v,
                    0,
                );
                const taller = sa.weight > sb.weight ? sa.name : sb.name;
                const heavier = sa.weight > sb.weight ? sa.name : sb.name;
                const stronger = totalA > totalB ? sa.name : sb.name;
                return createMCPResponse([
                    createTextContent(
                        {
                            first: { ...sa, total_base_stats: totalA },
                            second: { ...sb, total_base_stats: totalB },
                            taller,
                            heavier,
                            stronger,
                        },
                        true,
                    ),
                ]);
            } catch (error) {
                return createMCPResponse([
                    createTextContent({ error: error.message }, true),
                ]);
            }
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pokemon-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        return mcpHandler.fetch(request);
    },
};
