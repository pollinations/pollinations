import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const API = "https://pokeapi.co/api/v2";
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 700;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

// The caller's fetch, so tests can inject a mock. Defaults to global fetch.
let fetchImpl = (url, init) => fetch(url, init);

// Test-only hook: replace the outbound fetch.
export function setFetchImpl(fn) {
    fetchImpl = fn ?? ((url, init) => fetch(url, init));
}

// Test-only hook: drop memoized PokéAPI responses.
export function clearCache() {
    cache.clear();
}

const cache = new Map();

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    cache.delete(key);
    cache.set(key, hit);
    return hit.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: Date.now(), value });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one Pokémon.
 * Returns { ok: true, data } or { ok: false, error, kind, status, retryAfter }.
 * A 404 (no such Pokémon) and a 429/timeout are deliberately different outcomes.
 */
async function fetchPokemon(name, { retry = true } = {}) {
    const target = String(name ?? "").toLowerCase().trim();
    const url = `${API}/pokemon/${encodeURIComponent(target)}`;
    const cached = cacheGet(url);
    if (cached) return cached;

    let lastError = "request failed";
    let lastStatus = 0;
    let retryAfter = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let res;
        try {
            res = await fetchImpl(url, { signal: controller.signal });
        } catch (err) {
            clearTimeout(timer);
            const aborted = err?.name === "AbortError";
            lastError = aborted
                ? `PokéAPI request timed out after ${TIMEOUT_MS} ms`
                : `PokéAPI request failed: ${err?.message ?? "network error"}`;
            lastStatus = 0;
            if (attempt === 0 && retry) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            return { ok: false, error: lastError, kind: "upstream_error", status: lastStatus, retryAfter };
        }
        clearTimeout(timer);

        lastStatus = res.status;
        const header = res.headers?.get?.("retry-after");
        retryAfter = header ? Number(header) || header : null;

        if (res.status === 404) {
            return {
                ok: false,
                error: `no Pokémon named "${target}"`,
                kind: "not_found",
                status: 404,
                retryAfter: null,
            };
        }

        if (res.status === 429 || res.status === 503) {
            lastError =
                `PokéAPI is rate limiting right now (HTTP ${res.status})` +
                (retryAfter ? `; retry after ${retryAfter}s` : "");
            if (attempt === 0 && retry) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            return { ok: false, error: lastError, kind: "upstream_error", status: res.status, retryAfter };
        }

        if (!res.ok) {
            return {
                ok: false,
                error: `PokéAPI returned HTTP ${res.status}`,
                kind: "upstream_error",
                status: res.status,
                retryAfter,
            };
        }

        let data;
        try {
            data = await res.json();
        } catch (_err) {
            return {
                ok: false,
                error: "PokéAPI returned a non-JSON response",
                kind: "upstream_error",
                status: res.status,
                retryAfter,
            };
        }

        const value = { ok: true, data };
        cacheSet(url, value);
        return value;
    }

    return { ok: false, error: lastError, kind: "upstream_error", status: lastStatus, retryAfter };
}

// PokéAPI units: height is decimetres, weight is hectograms.
function toMetres(decimetres) {
    return Number((decimetres / 10).toFixed(2));
}

function toKilograms(hectograms) {
    return Number((hectograms / 10).toFixed(2));
}

function summarize(p) {
    return {
        name: p.name,
        id: p.id,
        base_experience: p.base_experience,
        // Numeric, so callers can compare and sort instead of parsing strings.
        height_dm: p.height,
        height_m: toMetres(p.height),
        weight_hg: p.weight,
        weight_kg: toKilograms(p.weight),
        types: (p.types ?? []).map((t) => t.type.name),
        abilities: (p.abilities ?? []).map((a) => a.ability.name),
        base_stats: Object.fromEntries(
            (p.stats ?? []).map((s) => [s.stat.name, s.base_stat]),
        ),
        total_base_stats: (p.stats ?? []).reduce((n, s) => n + s.base_stat, 0),
        sprite: p.sprites?.front_default ?? null,
    };
}

function failure(result) {
    const payload = {
        error: result.error,
        kind: result.kind,
        // A 429 is not "this Pokémon does not exist".
        retryable: result.kind !== "not_found" && result.kind !== "invalid_input",
    };
    if (result.kind === "not_found") payload.hint = "Check the name or Pokédex id";
    if (result.status) payload.httpStatus = result.status;
    if (result.retryAfter) payload.retryAfter = result.retryAfter;
    return createMCPResponse([createTextContent(payload, true)]);
}

function validQuery(value) {
    const v = String(value ?? "").trim();
    if (v.length === 0 || v.length > 64) return false;
    return /^[a-z0-9][a-z0-9 .'-]*$/i.test(v);
}

function buildServer() {
    const server = new McpServer(
        { name: "pokemon-mcp", title: "PokéAPI MCP", version: "0.2.0" },
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
            if (!validQuery(name)) {
                return failure({
                    error: `"${name}" is not a valid Pokémon name or id`,
                    kind: "invalid_input",
                });
            }
            const result = await fetchPokemon(name);
            if (!result.ok) return failure(result);
            return createMCPResponse([createTextContent(summarize(result.data), true)]);
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
            for (const q of [first, second]) {
                if (!validQuery(q)) {
                    return failure({
                        error: `"${q}" is not a valid Pokémon name or id`,
                        kind: "invalid_input",
                    });
                }
            }
            const [ra, rb] = await Promise.all([fetchPokemon(first), fetchPokemon(second)]);
            if (!ra.ok) return failure(ra);
            if (!rb.ok) return failure(rb);

            const a = summarize(ra.data);
            const b = summarize(rb.data);

            // Compare the real dimensions, not the formatted strings.
            const pick = (x, y, ka, kb) => (ka === kb ? "tie" : ka > kb ? x : y);
            return createMCPResponse([
                createTextContent(
                    {
                        first: a,
                        second: b,
                        taller: pick(a.name, b.name, a.height_m, b.height_m),
                        heavier: pick(a.name, b.name, a.weight_kg, b.weight_kg),
                        stronger: pick(a.name, b.name, a.total_base_stats, b.total_base_stats),
                    },
                    true,
                ),
            ]);
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
